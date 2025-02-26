/**
 * Return the number of elements in a collection.
 * 
 * @param {Array|Map|Set} c 
 * 
 * @returns {number}
 */
export function collectionSize(c) {
  if (Array.isArray(c)) {
    return c.length
  }
  else {
    if (c.size === undefined) {
      throw new Error(`${c} is not of a supported collection type`)
    }

    return c.size
  }
}

/**
 * Return an iterator over elements in the collection.
 * 
 * @param {Array<T>|Map<K,V>|Set<T>} c 
 * 
 * @returns {Iterator<T>|Iterator<[K,V]>}
 */
export function collectionIterator(c) {
  if (Array.isArray(c)) {
    return c.values()
  }
  else if (c instanceof Map) {
    return c.entries()
  }
  else if (c instanceof Set) {
    return c.values()
  }
  else {
    throw new Error(`${c} is not of a supported collection type`)
  }
}
