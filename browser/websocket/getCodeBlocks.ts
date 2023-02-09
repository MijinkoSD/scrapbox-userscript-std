import type { Line } from "../../deps/scrapbox-rest.ts";
import { pull } from "./pull.ts";

/** pull()から取れる情報で構成したコードブロックの最低限の情報 */
export interface TinyCodeBlock {
  /** ファイル名 */
  filename: string;

  /** コードブロック内の強調表示に使う言語名 */
  lang: string;

  /** タイトル行 */
  titleLine: Line;

  /** コードブロックの中身（タイトル行を含まない） */
  bodyLines: Line[];

  /** コードブロックの真下の行（無ければ`null`） */
  nextLine: Line | null;
}

/** `getCodeBlocks()`に渡すfilter */
export interface GetCodeBlocksFilter {
  /** ファイル名 */
  filename?: string;
  /** syntax highlightに使用されている言語名 */
  lang?: string;
}

/** コードブロックのタイトル行の情報を保持しておくためのinterface */
interface CodeTitle {
  fileName: string;
  lang: string;
  indent: number;
}

/** 他のページ（または取得済みの行データ）のコードブロックを全て取得する
 *
 * ファイル単位ではなく、コードブロック単位で返り値を生成する \
 * そのため、同じページ内に同名のコードブロックが複数あったとしても、分けた状態で返す
 *
 * @param target ページタイトル、または取得済みの行データ
 * @param filter 取得するコードブロックを絞り込むfilter
 * @return コードブロックの配列
 */
export const getCodeBlocks = async (
  target: { project: string; title: string } | { lines: Line[] },
  filter?: GetCodeBlocksFilter,
): Promise<TinyCodeBlock[]> => {
  const lines = await getLines(target);
  const codeBlocks: TinyCodeBlock[] = [];

  let currentCode: CodeTitle & {
    /** 読み取り中の行がコードブロックかどうか */
    isCodeBlock: boolean;
    /** 読み取り中のコードブロックを保存するかどうか */
    isCollect: boolean;
  } = {
    isCodeBlock: false,
    isCollect: false,
    fileName: "",
    lang: "",
    indent: 0,
  };
  for (const line of lines) {
    if (currentCode.isCodeBlock) {
      const body = extractFromCodeBody(line.text, currentCode.indent);
      if (body === null) {
        if (currentCode.isCollect) {
          codeBlocks[codeBlocks.length - 1].nextLine = line;
        }
        currentCode.isCodeBlock = false;
        continue;
      }
      if (!currentCode.isCollect) continue;
      codeBlocks[codeBlocks.length - 1].bodyLines.push(line);
    } else {
      const matched = extractFromCodeTitle(line.text);
      if (matched === null) {
        currentCode.isCodeBlock = false;
        continue;
      }
      const isCollect = isMatchFilter(matched, filter);
      currentCode = { isCodeBlock: true, isCollect: isCollect, ...matched };
      if (!currentCode.isCollect) continue;
      codeBlocks.push({
        filename: currentCode.fileName,
        lang: currentCode.lang,
        titleLine: line,
        bodyLines: [],
        nextLine: null,
      });
    }
  }
  return codeBlocks;
};

/** targetを`Line[]`に変換する */
async function getLines(
  target: { project: string; title: string } | { lines: Line[] },
): Promise<Line[]> {
  if ("lines" in target) {
    return target.lines;
  } else {
    const head = await pull(target.project, target.title);
    return head.lines;
  }
}

/** コードブロックのタイトル行から各種プロパティを抽出する
 *
 * @param lineText {string} 行テキスト
 * @return `lineText`がコードタイトル行であれば`CodeTitle`を、そうでなければ`null`を返す
 */
function extractFromCodeTitle(lineText: string): CodeTitle | null {
  const matched = lineText.match(/^(\s*)code:(.+?)(\(.+\)){0,1}\s*$/);
  if (matched === null) return null;
  const fileName = matched[2].trim();
  let lang = "";
  if (matched[3] === undefined) {
    const ext = fileName.match(/.+\.(.*)$/);
    if (ext === null) {
      // `code:ext`
      lang = fileName;
    } else if (ext[1] === "") {
      // `code:foo.`の形式はコードブロックとして成り立たないので排除する
      return null;
    } else {
      // `code:foo.ext`
      lang = ext[1];
    }
  } else {
    lang = matched[3];
  }
  return {
    fileName: fileName,
    lang: lang,
    indent: matched[1].length,
  };
}

/** コードタイトルのフィルターを検証する */
function isMatchFilter(
  codeTitle: CodeTitle,
  filter?: GetCodeBlocksFilter,
): boolean {
  if (filter?.filename && filter.filename !== codeTitle.fileName) return false;
  if (filter?.lang && filter.lang !== codeTitle.lang) return false;
  return true;
}

/** 行テキストがコードブロックの一部であればそのテキストを、そうでなければnullを返す
 *
 * @param lineText {string} 行テキスト
 * @param titleIndent {number} コードブロックのタイトル行のインデントの深さ
 * @return `lineText`がコードブロックの一部であればそのテキストを、そうでなければ`null`を返す
 */
function extractFromCodeBody(
  lineText: string,
  titleIndent: number,
): string | null {
  const matched = lineText.match(/^(\s*)(.*)$/);
  if (matched === null || matched.length < 2) {
    return null;
  }
  const indent = matched[1];
  const body = matched[2];
  if (indent.length <= titleIndent) return null;
  return indent.slice(indent.length - titleIndent) + body;
}
