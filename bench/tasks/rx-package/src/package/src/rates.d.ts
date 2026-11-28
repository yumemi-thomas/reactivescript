export declare const asked: string[];
export declare function fetchQuote(page: number): Promise<number>;
export declare const followed: string[];
export declare function follow(page: number): () => void;
export declare function fetchRate(code: string): Promise<number>;
