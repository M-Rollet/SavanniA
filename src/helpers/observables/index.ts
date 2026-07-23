/* eslint-disable dot-notation */
import { makeAutoObservable } from 'mobx';

export abstract class Observable<T> {
  abstract key: string;
  abstract state: T;
  abstract set(value: T): void;
}

/** Wraps a plain object in MobX makeAutoObservable, exposing it as an Observable<T>. */
export function createObservable<T>({ key, initialValue }: { key: string; initialValue: T }): Observable<T> {
  const observable = makeAutoObservable({
    key,
    state: initialValue,
    set(value: T) {
      this.state = value;
    },
  });
  return observable;
}
