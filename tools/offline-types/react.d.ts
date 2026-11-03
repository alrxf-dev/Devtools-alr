/**
 * OFFLINE-ONLY minimal type declarations for react, react-dom/client and the JSX runtime.
 *
 * Why this exists: the sandbox this project was built in could not reach the npm registry, so @types/react
 * could not be installed. This file lets `npm run typecheck:offline` type-check the project's own logic.
 * It is NOT a substitute for @types/react: element attribute types are looser than the real ones.
 * With registry access, install the real types and use `npm run typecheck`; delete this folder if you like.
 */

declare module 'react' {
  export type ReactText = string | number;
  export type ReactNode = ReactElement | string | number | bigint | boolean | null | undefined | Iterable<ReactNode>;
  export interface ReactElement<P = unknown> {
    type: unknown;
    props: P;
    key: string | null;
  }
  export type Key = string | number | bigint;
  export type JSXElementConstructor<P> = ((props: P) => ReactNode) | (new (props: P) => Component<P, unknown>);
  export type ComponentType<P = Record<string, never>> = FunctionComponent<P> | ComponentClass<P>;
  export interface FunctionComponent<P = Record<string, never>> {
    (props: P): ReactNode;
    displayName?: string;
  }
  export type FC<P = Record<string, never>> = FunctionComponent<P>;
  export interface ComponentClass<P = Record<string, never>> {
    new (props: P): Component<P, unknown>;
  }
  export type PropsWithChildren<P = unknown> = P & { children?: ReactNode };

  export class Component<P = Record<string, never>, S = Record<string, never>> {
    constructor(props: P);
    readonly props: Readonly<P>;
    state: Readonly<S>;
    setState(s: Partial<S> | ((prev: Readonly<S>, props: Readonly<P>) => Partial<S> | null) | null): void;
    render(): ReactNode;
    componentDidCatch?(error: Error, info: { componentStack?: string | null }): void;
    componentDidMount?(): void;
    componentWillUnmount?(): void;
    componentDidUpdate?(prevProps: Readonly<P>, prevState: Readonly<S>): void;
  }

  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type EffectCallback = () => void | (() => void);
  export type DependencyList = readonly unknown[];
  export interface RefObject<T> {
    current: T;
  }
  export interface MutableRefObject<T> {
    current: T;
  }
  export type Ref<T> = RefCallback<T> | RefObject<T | null> | null;
  export type RefCallback<T> = (instance: T | null) => void | (() => void);

  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useReducer<S, A>(reducer: (s: S, a: A) => S, initial: S): [S, Dispatch<A>];
  export function useEffect(effect: EffectCallback, deps?: DependencyList): void;
  export function useLayoutEffect(effect: EffectCallback, deps?: DependencyList): void;
  export function useRef<T>(initial: T): MutableRefObject<T>;
  export function useRef<T>(initial: T | null): RefObject<T | null>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
  export function useMemo<T>(factory: () => T, deps: DependencyList): T;
  export function useCallback<T extends (...args: never[]) => unknown>(cb: T, deps: DependencyList): T;
  export function useId(): string;
  export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T;
  export function useContext<T>(ctx: Context<T>): T;
  export function useDeferredValue<T>(v: T): T;
  export function useTransition(): [boolean, (cb: () => void) => void];
  export interface Context<T> {
    Provider: FunctionComponent<{ value: T; children?: ReactNode }>;
    Consumer: FunctionComponent<{ children: (v: T) => ReactNode }>;
  }
  export function createContext<T>(defaultValue: T): Context<T>;
  export function lazy<T extends ComponentType<never>>(load: () => Promise<{ default: T }>): T;
  export function memo<T extends ComponentType<never>>(c: T): T;
  export function createElement(type: unknown, props?: unknown, ...children: ReactNode[]): ReactElement;
  export const Fragment: unique symbol;
  export const StrictMode: FunctionComponent<{ children?: ReactNode }>;
  export const Suspense: FunctionComponent<{ fallback?: ReactNode; children?: ReactNode }>;

  export interface CSSProperties {
    [prop: string]: string | number | undefined;
  }

  export interface SyntheticEvent<T = Element, E = Event> {
    currentTarget: EventTarget & T;
    target: EventTarget;
    nativeEvent: E;
    preventDefault(): void;
    stopPropagation(): void;
    isDefaultPrevented(): boolean;
    type: string;
  }
  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> {
    target: EventTarget & T;
  }
  export type FormEvent<T = Element> = SyntheticEvent<T>;
  export interface MouseEvent<T = Element, E = globalThis.MouseEvent> extends SyntheticEvent<T, E> {
    clientX: number;
    clientY: number;
    button: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }
  export interface PointerEvent<T = Element> extends MouseEvent<T, globalThis.PointerEvent> {
    pointerId: number;
  }
  export interface KeyboardEvent<T = Element> extends SyntheticEvent<T, globalThis.KeyboardEvent> {
    key: string;
    code: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }
  export interface FocusEvent<T = Element> extends SyntheticEvent<T, globalThis.FocusEvent> {
    relatedTarget: EventTarget | null;
  }
  export interface DragEvent<T = Element> extends MouseEvent<T, globalThis.DragEvent> {
    dataTransfer: DataTransfer;
  }
  export interface ClipboardEvent<T = Element> extends SyntheticEvent<T, globalThis.ClipboardEvent> {
    clipboardData: DataTransfer;
  }

  type Handler<E> = (event: E) => void;

  export interface AriaAttributes {
    [key: `aria-${string}`]: string | number | boolean | undefined;
  }
  export interface DataAttributes {
    [key: `data-${string}`]: string | number | boolean | undefined;
  }

  export interface DOMAttributes<T> {
    children?: ReactNode;
    onClick?: Handler<MouseEvent<T>>;
    onMouseMove?: Handler<MouseEvent<T>>;
    onMouseDown?: Handler<MouseEvent<T>>;
    onMouseEnter?: Handler<MouseEvent<T>>;
    onMouseLeave?: Handler<MouseEvent<T>>;
    onDoubleClick?: Handler<MouseEvent<T>>;
    onChange?: Handler<ChangeEvent<T>>;
    onInput?: Handler<FormEvent<T>>;
    onSubmit?: Handler<FormEvent<T>>;
    onReset?: Handler<FormEvent<T>>;
    onKeyDown?: Handler<KeyboardEvent<T>>;
    onKeyUp?: Handler<KeyboardEvent<T>>;
    onFocus?: Handler<FocusEvent<T>>;
    onBlur?: Handler<FocusEvent<T>>;
    onDrop?: Handler<DragEvent<T>>;
    onDragOver?: Handler<DragEvent<T>>;
    onDragEnter?: Handler<DragEvent<T>>;
    onDragLeave?: Handler<DragEvent<T>>;
    onPaste?: Handler<ClipboardEvent<T>>;
    onPointerDown?: Handler<PointerEvent<T>>;
    onPointerMove?: Handler<PointerEvent<T>>;
    onPointerUp?: Handler<PointerEvent<T>>;
    onPointerCancel?: Handler<PointerEvent<T>>;
    onPointerLeave?: Handler<PointerEvent<T>>;
    onMouseEnter?: Handler<MouseEvent<T>>;
    onMouseLeave?: Handler<MouseEvent<T>>;
    onScroll?: Handler<SyntheticEvent<T>>;
    onLoad?: Handler<SyntheticEvent<T>>;
    onError?: Handler<SyntheticEvent<T>>;
    onLoadedMetadata?: Handler<SyntheticEvent<T>>;
    onTimeUpdate?: Handler<SyntheticEvent<T>>;
    onPlay?: Handler<SyntheticEvent<T>>;
    onPause?: Handler<SyntheticEvent<T>>;
    onEnded?: Handler<SyntheticEvent<T>>;
    onToggle?: Handler<SyntheticEvent<T>>;
    dangerouslySetInnerHTML?: { __html: string };
  }

  export interface HTMLAttributes<T> extends DOMAttributes<T>, AriaAttributes, DataAttributes {
    id?: string;
    className?: string;
    style?: CSSProperties;
    title?: string;
    role?: string;
    tabIndex?: number;
    hidden?: boolean;
    lang?: string;
    dir?: 'ltr' | 'rtl' | 'auto';
    draggable?: boolean;
    spellCheck?: boolean;
    translate?: 'yes' | 'no';
    inert?: boolean;
    key?: Key;
    ref?: Ref<T>;
    slot?: string;
    // element-specific attributes, intentionally merged here to keep this shim small
    href?: string;
    target?: string;
    rel?: string;
    download?: string | boolean;
    src?: string;
    srcSet?: string;
    alt?: string;
    width?: number | string;
    height?: number | string;
    type?: string;
    name?: string;
    value?: string | number | readonly string[];
    defaultValue?: string | number;
    checked?: boolean;
    defaultChecked?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    required?: boolean;
    multiple?: boolean;
    placeholder?: string;
    accept?: string;
    autoComplete?: string;
    autoCapitalize?: string;
    noValidate?: boolean;
    autoFocus?: boolean;
    min?: number | string;
    max?: number | string;
    step?: number | string;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    rows?: number;
    cols?: number;
    wrap?: string;
    htmlFor?: string;
    form?: string;
    label?: string;
    selected?: boolean;
    open?: boolean;
    controls?: boolean;
    loop?: boolean;
    muted?: boolean;
    autoPlay?: boolean;
    playsInline?: boolean;
    preload?: string;
    crossOrigin?: 'anonymous' | 'use-credentials' | '';
    loading?: 'lazy' | 'eager';
    decoding?: 'async' | 'sync' | 'auto';
    colSpan?: number;
    rowSpan?: number;
    scope?: string;
    start?: number;
    sandbox?: string;
    srcDoc?: string;
    list?: string;
    inputMode?: string;
    enterKeyHint?: string;
    capture?: string;
    webkitdirectory?: string;
    // SVG
    viewBox?: string;
    xmlns?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number | string;
    strokeLinecap?: string;
    strokeLinejoin?: string;
    d?: string;
    x?: number | string;
    y?: number | string;
    x1?: number | string;
    x2?: number | string;
    y1?: number | string;
    y2?: number | string;
    cx?: number | string;
    cy?: number | string;
    r?: number | string;
    rx?: number | string;
    points?: string;
    transform?: string;
    opacity?: number | string;
    shapeRendering?: string;
    fillRule?: string;
    clipRule?: string;
    baseFrequency?: string | number;
    numOctaves?: string | number;
    result?: string;
    in?: string;
    in2?: string;
    scale?: string | number;
    xChannelSelector?: string;
    yChannelSelector?: string;
    preserveAspectRatio?: string;
    focusable?: string | boolean;
  }

  export type DetailedHTMLProps<A, T> = A & { ref?: Ref<T> };
  export type ComponentProps<T> = T extends (props: infer P) => ReactNode ? P : never;
  export type ReactEventHandler<T = Element> = Handler<SyntheticEvent<T>>;

  export namespace JSX {
    type Element = ReactElement;
    interface ElementChildrenAttribute {
      children: unknown;
    }
    interface IntrinsicAttributes {
      key?: Key;
    }
    type ElementType = string | ((props: any) => ReactNode) | (new (props: any) => Component<any, unknown>);
    interface IntrinsicElements {
      [tag: string]: HTMLAttributes<any>;
      input: HTMLAttributes<HTMLInputElement>;
      textarea: HTMLAttributes<HTMLTextAreaElement>;
      select: HTMLAttributes<HTMLSelectElement>;
      a: HTMLAttributes<HTMLAnchorElement>;
      form: HTMLAttributes<HTMLFormElement>;
      canvas: HTMLAttributes<HTMLCanvasElement>;
      video: HTMLAttributes<HTMLVideoElement>;
      audio: HTMLAttributes<HTMLAudioElement>;
      img: HTMLAttributes<HTMLImageElement>;
      button: HTMLAttributes<HTMLButtonElement>;
      label: HTMLAttributes<HTMLLabelElement>;
      div: HTMLAttributes<HTMLDivElement>;
      i: HTMLAttributes<HTMLElement>;
      pre: HTMLAttributes<HTMLPreElement>;
      main: HTMLAttributes<HTMLElement>;
    }
  }
}

declare module 'react/jsx-runtime' {
  import type { ReactElement, ReactNode, Key } from 'react';
  export { JSX } from 'react';
  export function jsx(type: unknown, props: unknown, key?: Key): ReactElement;
  export function jsxs(type: unknown, props: unknown, key?: Key): ReactElement;
  export const Fragment: unique symbol;
  export type { ReactNode };
}

declare module 'react/jsx-dev-runtime' {
  export { jsx as jsxDEV, Fragment } from 'react/jsx-runtime';
}

declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}
