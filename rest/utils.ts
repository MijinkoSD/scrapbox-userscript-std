import type { ErrorLike } from "../deps/scrapbox.ts";
import { getProfile } from "./profile.ts";

// scrapbox.io内なら`window._csrf`にCSRF tokenが入っている
declare global {
  interface Window {
    __csrf?: string;
  }
}

/** HTTP headerのCookieに入れる文字列を作る
 *
 * @param sid connect.sidに入っている文字列
 */
export const cookie = (sid: string) => `connect.sid=${sid}`;

export type Result<T, E> = { ok: true; value: T } | { ok: false; value: E };
/** CSRF tokenを取得する
 *
 * @param sid - connect.sidに入っている文字列。不正な文字列を入れてもCSRF tokenを取得できるみたい
 */
export async function getCSRFToken(
  sid?: string,
): Promise<string> {
  if (window.__csrf) return window.__csrf;

  const user = await getProfile(sid ? { sid } : undefined);
  return user.csrfToken;
}

// cf. https://blog.uhy.ooo/entry/2021-04-09/typescript-is-any-as/#%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%BC%E5%AE%9A%E7%BE%A9%E5%9E%8B%E3%82%AC%E3%83%BC%E3%83%89%E3%81%AE%E5%BC%95%E6%95%B0%E3%81%AE%E5%9E%8B%E3%82%92%E3%81%A9%E3%81%86%E3%81%99%E3%82%8B%E3%81%8B
function isNotNullish(data: unknown): data is Record<string, unknown> {
  return data != null;
}
function isErrorLike(e: unknown): e is ErrorLike {
  if (!isNotNullish(e)) return false;
  return (e.name === undefined || typeof e.name === "string") &&
    typeof e.message === "string";
}
/** 与えられたobjectもしくはJSONテキストをErrorLikeに変換できるかどうか試す
 *
 * @param e 試したいobjectもしくはテキスト
 */
export function tryToErrorLike(e: unknown): false | ErrorLike {
  try {
    const json = typeof e === "string" ? JSON.parse(e) : e;
    if (!isErrorLike(json)) return false;
    return json;
  } catch (e2: unknown) {
    if (e2 instanceof SyntaxError) return false;
    throw e2;
  }
}

/** classを使わずにカスタムエラーを作る */
export function makeCustomError(name: string, message: string) {
  const error = new Error();
  error.name = name;
  error.message = message;
  return error;
}
