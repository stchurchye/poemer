import type { LocalStore } from '@shiren/shared';

let getStoreRef: () => LocalStore | null = () => null;
let markChangedRef: () => void = () => {};

export function registerLocalApiRuntime(handlers: {
  getStore: () => LocalStore | null;
  markChanged: () => void;
}): () => void {
  getStoreRef = handlers.getStore;
  markChangedRef = handlers.markChanged;
  return () => {
    getStoreRef = () => null;
    markChangedRef = () => {};
  };
}

export function getLocalApiRuntime() {
  return {
    getStore: getStoreRef,
    markChanged: markChangedRef,
  };
}
