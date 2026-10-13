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

const describeWorkItem = (item, source) => {
  const duration = safeRead(item, 'duration');
  const keys = item && typeof item === 'object'
    ? Object.keys(item).slice(0, 20).join(',') || '(none)'
    : '(not-an-object)';
  return 'source=' + source +
    ' type=' + (item === null ? 'null' : typeof item) +
    ' id=' + summarizeScalar(safeRead(item, 'id')) +
    ' entityId=' + summarizeScalar(safeRead(item, 'entityId')) +
    ' date=' + summarizeScalar(safeRead(item, 'date')) +
    ' durationType=' + (duration === null ? 'null' : typeof duration) +
    ' durationMinutes=' + summarizeScalar(safeRead(duration, 'minutes')) +
    ' textPresent=' + (safeRead(item, 'text') !== undefined) +
    ' descriptionPresent=' + (safeRead(item, 'description') !== undefined) +
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
