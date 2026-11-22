import fetch from "solid-use/fetch";
export const createJson = url => fetch(url, undefined, true).json();
