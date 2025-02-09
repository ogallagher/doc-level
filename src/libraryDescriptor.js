import { RelationalTagConnection, SerializableEntity } from 'relational_tags'

/**
 * Anything that defines a collection of tags by which library items can be registered/described.
 * 
 * Instances themselves become tagged entities in the library.
 */
export class LibraryDescriptor extends SerializableEntity {
  /**
   * Root tag for this descriptor.
   * @type {RelationalTag}
   */
  static t
  
  /**
   * 
   * @param {LibraryDescriptor|undefined} parent 
   */
  constructor(parent) {
    super()

    /**
     * Reference to the entity to which this belongs. By following
     * `parent` links, we should always arrive at an instance of {@link LibraryBook}.
     * 
     * @type {LibraryDescriptor|undefined}
     */
    this.parent = parent
  }

  /**
   * Define tags relevant to this descriptor.
   */
  static initTags() {
    this.throwErrorNotImplemented('initTags')
  }

  /**
   * Add tag as a child of this descriptor's root tag.
   * 
   * @param {RelationalTag} tag 
   */
  static adoptTag(tag) {
    this.t.connect_to(tag, RelationalTagConnection.TYPE_TO_TAG_CHILD)
  }

  /**
   * Register an instance of this descriptor as a library item.
   */
  setTags() {
    LibraryDescriptor.throwErrorNotImplemented('registerItem')
  }

  /**
   * Set the parent of this object within the library, if unknown at instantiation or dynamic.
   * @param {LibraryDescriptor} parent
   */
  setParent(parent) {
    this.parent = parent
  }

  getSerializable(key, val) {
    if (key === 'parent') {
      return undefined
    }
    else {
      return val
    }
  }

  /**
   * @throws Error for unimplemented abstract method.
   */
  static throwErrorNotImplemented(methodName) {
    throw new Error(`abstract method ${methodName} must be implemented by subclass`, {
      cause: 'abstract method'
    })
  }
}