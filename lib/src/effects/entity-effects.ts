import { Inject, Injectable, InjectionToken, Optional } from '@angular/core';
import { Action } from '@ngrx/store';
import { Effect, Actions } from '@ngrx/effects';

import { asyncScheduler, Observable, of, Scheduler } from 'rxjs';
import { concatMap, catchError, delay, map } from 'rxjs/operators';

import { EntityAction } from '../actions/entity-action';
import { EntityActionFactory } from '../actions/entity-action-factory';
import { EntityOp, OP_SUCCESS } from '../actions/entity-op';
import { ofEntityOp } from '../actions/entity-action-operators';
import { Update } from '../utils/ngrx-entity-models';

import { EntityDataService } from '../dataservices/entity-data.service';
import { PersistenceResultHandler } from '../dataservices/persistence-result-handler.service';

export const persistOps: EntityOp[] = [
  EntityOp.QUERY_ALL,
  EntityOp.QUERY_LOAD,
  EntityOp.QUERY_BY_KEY,
  EntityOp.QUERY_MANY,
  EntityOp.SAVE_ADD_ONE,
  EntityOp.SAVE_DELETE_ONE,
  EntityOp.SAVE_UPDATE_ONE
];

/** Token to inject a special RxJS Scheduler during marble tests. */
export const ENTITY_EFFECTS_SCHEDULER = new InjectionToken<Scheduler>('EntityEffects Scheduler');

@Injectable()
export class EntityEffects {
  // See https://github.com/ReactiveX/rxjs/blob/master/doc/marble-testing.md
  /** Delay for error and skip observables. Must be multiple of 10 for marble testing. */
  private responseDelay = 10;

  @Effect()
  // Concurrent persistence requests considered unsafe.
  // `concatMap` ensures each request must complete-or-fail before making the next request.
  persist$: Observable<Action> = this.actions.pipe(ofEntityOp(persistOps), concatMap(action => this.persist(action)));

  constructor(
    private actions: Actions,
    private dataService: EntityDataService,
    private entityActionFactory: EntityActionFactory,
    private resultHandler: PersistenceResultHandler,
    /**
     * Injecting an optional Scheduler that will be undefined
     * in normal application usage, but its injected here so that you can mock out
     * during testing using the RxJS TestScheduler for simulating passages of time.
     */
    @Optional()
    @Inject(ENTITY_EFFECTS_SCHEDULER)
    private scheduler: Scheduler
  ) {}

  /**
   * Perform the requested persistence operation and return a scalar Observable<Action>
   * that the effect should dispatch to the store after the server responds.
   * @param action A persistence operation EntityAction
   */
  persist(action: EntityAction): Observable<Action> {
    if (action.payload.skip) {
      // Should not persist. Pretend it succeeded.
      return this.handleSkipSuccess$(action);
    }
    if (action.payload.error) {
      return this.handleError$(action)(action.payload.error);
    }
    try {
      return this.callDataService(action).pipe(map(this.resultHandler.handleSuccess(action)), catchError(this.handleError$(action)));
    } catch (err) {
      return this.handleError$(action)(err);
    }
  }

  private callDataService(action: EntityAction) {
    const { entityName, entityOp, data } = action.payload;
    const service = this.dataService.getService(entityName);
    switch (entityOp) {
      case EntityOp.QUERY_LOAD:
      case EntityOp.QUERY_ALL: {
        return service.getAll();
      }
      case EntityOp.QUERY_BY_KEY: {
        return service.getById(data);
      }
      case EntityOp.QUERY_MANY: {
        return service.getWithQuery(data);
      }
      case EntityOp.SAVE_ADD_ONE: {
        return service.add(data);
      }
      case EntityOp.SAVE_DELETE_ONE: {
        return service.delete(data);
      }
      case EntityOp.SAVE_UPDATE_ONE: {
        const { id, changes } = data as Update<any>; // data must be Update<T>
        return service.update(data).pipe(
          map(updatedEntity => {
            // Return an Update<T> with merged updated entity data.
            // If no update data from the server,
            // assume the server made no additional changes of its own and
            // append `unchanged: true` to the original payload.
            const hasData = updatedEntity && Object.keys(updatedEntity).length > 0;
            return hasData ? { id, changes: { ...changes, ...updatedEntity } } : { id, changes, unchanged: true };
          })
        );
      }
      default: {
        throw new Error(`Persistence action "${entityOp}" is not implemented.`);
      }
    }
  }

  /**
   * Handle error result of persistence operation on an EntityAction,
   * returning a scalar observable of error action
   */
  private handleError$(action: EntityAction): (error: Error) => Observable<EntityAction> {
    // Although error may return immediately,
    // ensure observable takes some time,
    // as app likely assumes asynchronous response.
    return (error: Error) =>
      of(this.resultHandler.handleError(action)(error)).pipe(delay(this.responseDelay, this.scheduler || asyncScheduler));
  }

  /**
   * Because EntityAction.payload.skip is true, skip the persistence step and
   * return a scalar success action that looks like the operation succeeded.
   */
  private handleSkipSuccess$(originalAction: EntityAction): Observable<EntityAction> {
    const successOp = <EntityOp>(originalAction.payload.entityOp + OP_SUCCESS);
    const successAction = this.entityActionFactory.createFromAction(originalAction, { entityOp: successOp });
    // Although returns immediately,
    // ensure observable takes one tick (by using a promise),
    // as app likely assumes asynchronous response.
    return of(successAction).pipe(delay(this.responseDelay, this.scheduler || asyncScheduler));
  }
}
