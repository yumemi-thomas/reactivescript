// A text that is not JSON throws, as JSON.parse does.
export const parse = text => JSON.parse(text);
export const stringify = value => JSON.stringify(value);
