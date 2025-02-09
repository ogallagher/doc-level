import { RelationalTagConnection } from 'relational_tags'

/**
 * Anything that defines a collection of tags by which library items can be registered/described.
 * 
 * Instances themselves become tagged entities in the library.
 */
export class LibraryDescriptor {
  /**
   * Root tag for this descriptor.
   * @type {RelationalTag}
   */
  static t

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
   * @throws Error for unimplemented abstract method.
   */
  static throwErrorNotImplemented(methodName) {
    throw new Error(`abstract method ${methodName} must be implemented by subclass`, {
      cause: 'abstract method'
    })
  }
}