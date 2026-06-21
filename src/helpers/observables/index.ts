/* eslint-disable dot-notation */
import { IObjectDidChange, makeAutoObservable, observe, toJS } from 'mobx';

export abstract class ObservableNotification<T> {
  abstract key: string;
  abstract type: string;
  abstract payload: T;
  abstract state: T;
}

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

/**
 * Subscribes to state changes on an Observable.
 * The callback receives an ObservableNotification on every MobX 'update' change.
 */
export const subscribe = <T>(observable: Observable<T>, fun: (args: ObservableNotification<T>) => void) => {
  observe(observable, (change: IObjectDidChange) => {
    if (change.type === 'update') {
      const newEvent: T = change?.newValue;
      fun({
        key: change.object['key'],
        type: change.type,
        payload: newEvent,
        state: toJS(newEvent),
      });
    }
  });
};
