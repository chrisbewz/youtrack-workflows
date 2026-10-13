const safeRead = (value, property) => {
  try {
    return value === null || value === undefined ? undefined : value[property];
  } catch (error) {
    return '[read-error]';
  }
};

const summarizeScalar = value => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '[' + typeof value + ']';
};

const describeMethodIdentity = (item, methodName) => {
  try {
    if (!item || typeof item[methodName] !== 'function') return 'unavailable';
    const value = String(item[methodName]());
    const id = value.match(/\b\d+-\d+\b/);
    return id ? id[0] : 'non-id(length=' + value.length + ')';
  } catch (error) {
    return 'error';
  }
};

const describeWorkItem = (item, source) => {
  const duration = safeRead(item, 'duration');
  const author = safeRead(item, 'author');
  const creator = safeRead(item, 'creator');
  const type = safeRead(item, 'type');
  const keys = item && typeof item === 'object'
    ? Object.keys(item).slice(0, 20).join(',') || '(none)'
    : '(not-an-object)';
  return 'source=' + source +
    ' type=' + (item === null ? 'null' : typeof item) +
    ' id=' + summarizeScalar(safeRead(item, 'id')) +
    ' entityId=' + summarizeScalar(safeRead(item, 'entityId')) +
    ' $$type=' + summarizeScalar(safeRead(item, '$$type')) +
    ' date=' + summarizeScalar(safeRead(item, 'date')) +
    ' created=' + summarizeScalar(safeRead(item, 'created')) +
    ' updated=' + summarizeScalar(safeRead(item, 'updated')) +
    ' durationType=' + (duration === null ? 'null' : typeof duration) +
    ' durationMinutes=' + summarizeScalar(safeRead(duration, 'minutes')) +
    ' authorLogin=' + summarizeScalar(safeRead(author, 'login')) +
    ' creatorLogin=' + summarizeScalar(safeRead(creator, 'login')) +
    ' typeName=' + summarizeScalar(safeRead(type, 'name')) +
    ' textPresent=' + (safeRead(item, 'text') !== undefined) +
    ' descriptionPresent=' + (safeRead(item, 'description') !== undefined) +
    ' toStringId=' + describeMethodIdentity(item, 'toString') +
    ' toShortStringId=' + describeMethodIdentity(item, 'toShortString') +
    ' keys=' + keys;
};

const describeWorkItemsRuntime = workItems => {
  const size = safeRead(workItems, 'size');
  const canGet = typeof safeRead(workItems, 'get') === 'function';
  const canForEach = typeof safeRead(workItems, 'forEach') === 'function';
  const result = {
    collection: 'size=' + summarizeScalar(size) + ' get=' + (canGet ? 'function' : typeof safeRead(workItems, 'get')) + ' forEach=' + (canForEach ? 'function' : typeof safeRead(workItems, 'forEach')),
    items: []
  };

  const numericSize = Number(size);
  if (canGet && Number.isFinite(numericSize)) {
    for (let index = 0; index < Math.min(numericSize, 5); index += 1) {
      let item;
      try {
        item = workItems.get(index);
      } catch (error) {
        item = '[get-error]';
      }
      result.items.push(describeWorkItem(item, 'get[' + index + ']'));
    }
  }
  return result;
};

module.exports = { describeWorkItemsRuntime };
