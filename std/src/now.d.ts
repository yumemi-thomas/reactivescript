export declare function first<T>(read: () => T, otherwise: T): T;
export declare const matches: (query: string) => boolean | undefined;
export declare const isVisible: () => boolean;
export declare const windowSize: () => { width: number; height: number };
export declare const boxOf: (element: Element) => { x: number; y: number; width: number; height: number };
