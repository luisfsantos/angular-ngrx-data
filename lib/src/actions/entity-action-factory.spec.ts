import { EntityAction, EntityActionOptions, EntityActionPayload } from './entity-action';
import { EntityOp } from './entity-op';
import { EntityActionFactory } from './entity-action-factory';
import { MergeStrategy } from './merge-strategy';
import { CorrelationIdGenerator } from '..';

class Hero {
  id: number;
  name: string;
}

describe('EntityActionFactory', () => {
  let factory: EntityActionFactory;

  beforeEach(() => {
    factory = new EntityActionFactory();
  });

  it('#create should create an EntityAction from entityName and entityOp', () => {
    const action = factory.create('Hero', EntityOp.QUERY_ALL);
    const { entityName, entityOp, data } = action.payload;
    expect(entityName).toBe('Hero');
    expect(entityOp).toBe(EntityOp.QUERY_ALL);
    expect(data).toBeUndefined('no data property');
  });

  it('#create should create an EntityAction with the given data', () => {
    const hero: Hero = { id: 42, name: 'Francis' };
    const action = factory.create('Hero', EntityOp.ADD_ONE, hero);
    const { entityName, entityOp, data } = action.payload;
    expect(entityName).toBe('Hero');
    expect(entityOp).toBe(EntityOp.ADD_ONE);
    expect(data).toBe(hero);
  });

  it('#create should create an EntityAction with options', () => {
    const options: EntityActionOptions = {
      correlationId: 'CRID42',
      isOptimistic: true,
      mergeStrategy: MergeStrategy.OverwriteChanges,
      tag: 'Foo'
    };

    // Don't forget placeholder for missing optional data!
    const action = factory.create('Hero', EntityOp.QUERY_ALL, undefined, options);
    const { entityName, entityOp, data, correlationId, isOptimistic, mergeStrategy, tag } = action.payload;
    expect(entityName).toBe('Hero');
    expect(entityOp).toBe(EntityOp.QUERY_ALL);
    expect(data).toBeUndefined();
    expect(correlationId).toBe(options.correlationId);
    expect(isOptimistic).toBe(options.isOptimistic);
    expect(mergeStrategy).toBe(options.mergeStrategy);
    expect(tag).toBe(options.tag);
  });

  it('#create create an EntityAction from an EntityActionPayload', () => {
    const hero: Hero = { id: 42, name: 'Francis' };
    const payload: EntityActionPayload = {
      entityName: 'Hero',
      entityOp: EntityOp.ADD_ONE,
      data: hero,
      correlationId: 'CRID42',
      isOptimistic: true,
      mergeStrategy: MergeStrategy.OverwriteChanges,
      tag: 'Foo'
    };
    const action = factory.create(payload);

    const { entityName, entityOp, data, correlationId, isOptimistic, mergeStrategy, tag } = action.payload;
    expect(entityName).toBe(payload.entityName);
    expect(entityOp).toBe(payload.entityOp);
    expect(data).toBe(payload.data);
    expect(correlationId).toBe(payload.correlationId);
    expect(isOptimistic).toBe(payload.isOptimistic);
    expect(mergeStrategy).toBe(payload.mergeStrategy);
    expect(tag).toBe(payload.tag);
  });

  it('#createFromAction should create EntityAction from another EntityAction', () => {
    const hero: Hero = { id: 42, name: 'Francis' };
    const action1 = factory.create('Hero', EntityOp.ADD_ONE, hero);
    const action = factory.createFromAction(action1, { entityOp: EntityOp.SAVE_ADD_ONE });
    const { entityName, entityOp, data } = action.payload;
    expect(entityName).toBe('Hero');
    expect(entityOp).toBe(EntityOp.SAVE_ADD_ONE);
    // Data from source action forwarded to the new action.
    expect(data).toBe(hero);
  });

  it('#createFromAction should copy the options from the source action', () => {
    const options: EntityActionOptions = {
      correlationId: 'CRID42',
      isOptimistic: true,
      mergeStrategy: MergeStrategy.OverwriteChanges,
      tag: 'Foo'
    };
    // Don't forget placeholder for missing optional data!
    const sourceAction = factory.create('Hero', EntityOp.QUERY_ALL, undefined, options);

    const queryResults: Hero[] = [{ id: 1, name: 'Francis' }, { id: 2, name: 'Alex' }];
    const action = factory.createFromAction(sourceAction, {
      entityOp: EntityOp.QUERY_ALL_SUCCESS,
      data: queryResults
    });

    const { entityName, entityOp, data, correlationId, isOptimistic, mergeStrategy, tag } = action.payload;
    expect(entityName).toBe('Hero');
    expect(entityOp).toBe(EntityOp.QUERY_ALL_SUCCESS);
    expect(data).toBe(queryResults);
    expect(correlationId).toBe(options.correlationId);
    expect(isOptimistic).toBe(options.isOptimistic);
    expect(mergeStrategy).toBe(options.mergeStrategy);
    expect(tag).toBe(options.tag);
  });

  it('#createFromAction can suppress the data property', () => {
    const hero: Hero = { id: 42, name: 'Francis' };
    const action1 = factory.create('Hero', EntityOp.ADD_ONE, hero);
    const action = factory.createFromAction(action1, { entityOp: EntityOp.SAVE_ADD_ONE, data: undefined });
    const { entityName, entityOp, data } = action.payload;
    expect(entityName).toBe('Hero');
    expect(entityOp).toBe(EntityOp.SAVE_ADD_ONE);
    expect(data).toBeUndefined();
  });

  it('#formatActionType should format type with the entityName', () => {
    const action = factory.create('Hero', EntityOp.QUERY_ALL);
    const expectedFormat = factory.formatActionType(EntityOp.QUERY_ALL, 'Hero');
    expect(action.type).toBe(expectedFormat);
  });

  it('#formatActionType should format type with given tag instead of the entity name', () => {
    const tag = 'Hero - Tag Test';
    const action = factory.create('Hero', EntityOp.QUERY_ALL, null, { tag });
    expect(action.type).toContain(tag);
  });

  it('can re-format generated action.type with a custom #formatActionType()', () => {
    factory.formatActionType = (op, entityName) => `${entityName}_${op}`.toUpperCase();

    const expected = ('Hero_' + EntityOp.QUERY_ALL).toUpperCase();
    const action = factory.create('Hero', EntityOp.QUERY_ALL);
    expect(action.type).toBe(expected);
  });

  it('should throw if do not specify entityName', () => {
    expect(() => factory.create(null)).toThrow();
  });

  it('should throw if do not specify EntityOp', () => {
    expect(() => factory.create({ entityName: 'Hero', entityOp: null })).toThrow();
  });
});
