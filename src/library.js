import { RelationalTag, RelationalTagConnection } from 'relational_tags'
import { LibraryDescriptor } from './libraryDescriptor.js'
import { Difficulty, Ideology, Maturity, TextProfile, Topic } from './textProfile.js'
import { StoriesIndex, getStoriesIndex } from './storiesIndex.js'
import { StorySummary } from './storySummary.js'
import { IndexPage } from './indexPage.js'
import { loadText, loadProfile } from './reader.js'
import { SEARCH_TAGS_MAX, SEARCH_TAG_BOOKS_MAX } from './config.js'
/**
 * @typedef {import('pino').Logger} Logger
 */

/**
 * @type {Logger}
 */
let logger

/**
 * tag-tag connection type for parent to child.
 * @type {string}
 */
export const TYPE_TO_TAG_CHILD = RelationalTagConnection.TYPE_TO_TAG_CHILD
export const TYPE_TO_TAG_PARENT = RelationalTagConnection.inverse_type(TYPE_TO_TAG_CHILD)
/**
 * Prefix of an ISO timestamp to use for date-value tags.
 * @type {number}
 */
export const TAG_DATE_PRECISION = 'yyyy-mm-dd'.length
/**
 * Minimum length of a word within free text to be included in a compressed tag name.
 */
export const TAG_TEXT_WORD_LEN_MIN = 4
/**
 * Maximum length of a tag name derived from free text.
 */
export const TAG_TEXT_LEN_MAX = 16
/**
 * Maximum number of generations to include in a lineage tag name.
 * 
 * Given tag-tag connections are parent-child relationships, the lineage name for
 * a child is `parent.child`, here having 2 "generations"/parts.
 */
export const TAG_LINEAGE_NAME_PARTS_MAX = 4

/**
 * Reset tags and call {@link LibraryDescriptor.initTags initTags} on every library descriptor.
 */
function initTags() {
  RelationalTag.clear()

  // LibraryDescriptor subclass root tags
  Library.t = RelationalTag.new('library')
  LibraryBook.t = RelationalTag.new('library-book')
  IndexPage.t = RelationalTag.new('index-page')
  StoriesIndex.t = RelationalTag.new('stories-index')
  StorySummary.t = RelationalTag.new('story')
  TextProfile.t = RelationalTag.new('text-profile')
  Ideology.t = RelationalTag.new('ideology')
  Topic.t = RelationalTag.new('topic')
  Difficulty.t = RelationalTag.new('difficulty')
  Maturity.t = RelationalTag.new('maturity')

  Library.initTags()
  LibraryBook.initTags()
  IndexPage.initTags()
  StoriesIndex.initTags()
  StorySummary.initTags()
  TextProfile.initTags()
  Ideology.initTags()
  Topic.initTags()
  Difficulty.initTags()
  Maturity.initTags() 
}

/**
 * Init module logger and tags for all subclasses of {@link LibraryDescriptor}.
 * 
 * @param {Logger} parentLogger
 * @returns {Promise<undefined>}
 */
export function init(parentLogger) {
  return new Promise(function (res) {
    logger = parentLogger.child(
      {
        name: 'library'
      }
    )

    RelationalTag.config(false)

    initTags()

    logger.debug('end init')
    res(logger)
  })
}

/**
 * Create a {@link Library} instance from the given filesystem.
 * 
 * Everything from previous `Library` instances is replaced.
 * 
 * @param {IndexPage[]} indexPages 
 * @param {string} profilesDir
 * 
 * @returns {Promise<Library>}
 */
export async function getLibrary(indexPages, profilesDir) {
  initTags()

  /**
   * @type {Promise[]}
   */
  let pPages = []
  /**
   * @type {Library}
   */
  const library = new Library()

  for (let page of indexPages) {
    logger.debug('create LibraryBook instance for each story in page-path=%s', page.filePath)
    let pPage = loadText(page.filePath)
    .then(JSON.parse)
    .then(
      /**
       * @param {StorySummary[]} storySummaries 
       */
      (storySummaries) => {
        return Promise.all(storySummaries.map(async (story) => {
          /**
           * @type {TextProfile|undefined}
           */
          let profile
          try {
            profile = await loadProfile(story.id, profilesDir)
          }
          catch (err) {
            logger.debug('no profile found for story=%s', story.id)
            logger.trace(err)
          }

          return {story: StorySummary.fromData(story), profile}
        }))
      }
    )
    .then((storyProfiles) => {
      storyProfiles.forEach(({story, profile}) => {
        library.addBook(new LibraryBook(library, story, page, profile))
      })
    })

    pPages.push(pPage)
  }

  await Promise.all(pPages)
  return library
}

/**
 * @param {Date} date 
 * @returns Tag derived from date.
 */
export function getDateTag(date) {
  return RelationalTag.get(date.toISOString().substring(0, TAG_DATE_PRECISION))
}

/**
 * Convert free text to a compressed tag name.
 * 
 * This function will need to be updated to include legible characters in other languages.
 * 
 * @param {string} text 
 */
export function getTextTag(text) {
  if (text.length > TAG_TEXT_LEN_MAX) {
    let tagText = text
    // lowercase
    .toLowerCase()
    // split on illegible chars
    .split(/[^a-z0-9가-힣áéíóúäëïöüÿç]+/)
    // drop small words
    .filter((w) => w.length > TAG_TEXT_WORD_LEN_MIN)
    // space delimited
    .join(' ')

    logger.debug('compressed text %s to tag name %s', text, tagText)
    return RelationalTag.get(tagText)
  }
  else {
    return RelationalTag.get(text)
  }
}

/**
 * @param {RelationalTag} tag 
 * @returns {RelationalTag|undefined}
 */
function getTagParent(tag) {
  for (let [target, conn] of tag.connections.entries()) {
    if (target instanceof RelationalTag && conn.type === TYPE_TO_TAG_PARENT) {
      return target
    }
  }
  return undefined
}

/**
 * @param {RelationalTag} tag 
 * @param {string} delim
 * @param {string} truncPrefix
 */
export function getTagLineageName(tag, delim='.', truncPrefix='...') {
  /**
   * Tag lineage, ordered child last.
   * 
   * @type {string[]}
   */
  let generations = [tag.name]
  /**
   * @type {RelationalTag}
   */
  let parent = tag

  while (generations.length < TAG_LINEAGE_NAME_PARTS_MAX && (parent = getTagParent(parent)) !== undefined) {
    generations.splice(0, 0, parent.name)
  }

  if (generations.length >= TAG_LINEAGE_NAME_PARTS_MAX && getTagParent(parent) !== undefined) {
    generations.splice(0, 0, truncPrefix)
  }

  return generations.join(delim)
}

/**
 * Export/render the given `Library` instance as a content string in the requested format.
 * 
 * @param {Library} library 
 * @param {string} format
 * @param {string|undefined} startTagName Tag from which to search.
 * @param {string|RegExp|undefined} query Search query.
 * @param {string} sort Sort direction. 
 * 
 * @returns {Generator<string>}
 */
export function *exportLibrary(library, format, startTagName, query, sort) {
  /**
   * @type {RelationalTag}
   */
  let startTag
  if (startTagName === undefined) {
    startTag = Library.t
  }
  else {
    startTag = RelationalTag.get(startTagName, false)
  }

  if (format === 'tag') {
    logger.info('render library tags')

    yield 'doc-level all tags\n\n'

    for (
      let tagLineageName of 
      [...RelationalTag.all_tags.values()]
      .map((t) => getTagLineageName(t, ' / '))
      .toSorted((a, b) => a.localeCompare(b))
    ) {
      yield tagLineageName + '\n'
    }

    yield '\n'
  }
  else {
    // TODO why is last pathToBook edge recursive?
    const bookGen = library.getBooks(startTag, query, sort)
    /**
     * @type {LibraryBook}
     */
    let book
    /**
     * @type {RelationalTagConnection[]}
     */
    let bookSearchPath

    if (format === 'txt') {
      logger.info('render library as a list books')
  
      yield `=== books in library for start-tag=${startTagName} query=${query} sort=${sort}\n\n`
      for (
        let next = bookGen.next(); 
        !next.done && ([book, bookSearchPath] = next.value);
        next = bookGen.next()
      ) {
        yield '- \n'
        for (let chunk of book.describe('  ', bookSearchPath)) {
          yield chunk
        }
  
        yield '\n\n'
      }
      yield `===\n`
    }
    else if (format === 'md') {
      logger.info('render library books as markdown with embedded mermaid')
  
      // header
      yield '# doc-level library export\n\n'

      // save input
      yield `## input\n\n`
      yield `\`--show-library ${format} --tag ${startTagName} --query ${query} --sort ${sort}\`\n`
      yield '\n'

      yield `## output\n\n`

      // begin mermaid diagram
      yield '```mermaid\n'
      yield '\nflowchart LR\n'

      // define book style
      yield `classDef book text-align:left;\n`
      // define tag style
      yield `classDef tag text-align:center;\n`
      
      /**
       * @type {Map<LibraryDescriptor|RelationalTag, string>}
       */
      const nodes = new Map()
      /**
       * @type {Set<RelationalTagConnection>}
       */
      const edges = new Set()

      for (
        let next = bookGen.next(); 
        !next.done && ([book, bookSearchPath] = next.value);
        next = bookGen.next()
      ) {
        /**
         * @type {string}
         */
        let bookId
        // current implementation of Library.getBooks should not return duplicate books,
        // but here we do not rely on that assumption.
        if (nodes.has(book)) {
          bookId = book
        }
        else {
          // define book
          bookId = `book-${nodes.size}`
          nodes.set(book, bookId)
          yield `${bookId}["`
          for (let chunk of book.describe()) {
            yield chunk
          }
          yield `"]:::book\n`
        }

        for (let conn of bookSearchPath) {
          // skip connection if edge already created
          if (edges.has(conn)) {
            continue
          }
          else {
            edges.add(conn)
          }

          /**
           * @type {RelationalTag}
           */
          let tag = conn.source
          /**
           * @type {string}
           */
          let tagId 
          if (nodes.has(tag)) {
            tagId = nodes.get(tag)
          }
          else {
            // define tag
            tagId = `tag-${nodes.size}`
            nodes.set(tag, tagId)
            yield `${tagId}(["${tag.name}"]):::tag\n`
          }

          // create edge if not recursive
          if (conn.source !== conn.target) {
            const edgeLabel = (
              conn.weight !== null ? `|"${conn.weight}"|` : ''
            )
            
            if (conn.target instanceof RelationalTag) {
              // tag--tag
              if (conn.type === TYPE_TO_TAG_CHILD) {
                /**
                 * @type {string}
                 */
                let childId
                if (nodes.has(conn.target)) {
                  childId = nodes.get(conn.target)
                }
                else {
                  // define tag
                  childId = `tag-${nodes.size}`
                  nodes.set(conn.target, childId)
                  yield `${childId}(["${conn.target.name}"]):::tag\n`
                }
    
                yield `${tagId} -->${edgeLabel} ${childId}\n`
              }
              else {
                yield `%% skip edge for ${conn}`
              }
            }
            // currently, bookSearchPath should only edges between tags, so this is not used
            else if (conn.target instanceof LibraryDescriptor) {
              // tag--LibraryDescriptor
              let dId
    
              if (!nodes.has(conn.target)) {
                // define descriptor
                dId = `descriptor-${nodes.size}`
                nodes.set(conn.target, dId)
                yield `${dId}["${conn.target.toString()}"]\n`
              }
              else {
                dId = nodes.get(conn.target)
              }
              
              // connect to descriptor
              yield `${tagId} -->${edgeLabel} ${dId}\n`
            }
            else {
              // tag--<unknown>
              yield `%% ERROR cannot graph connection to entity ${conn.target}\n`
            }
          }
        }

        // create edge from last tag in search path to book
        const lastConn = bookSearchPath[bookSearchPath.length-1]
        if (lastConn.target !== book) {
          yield `${nodes.get(lastConn.target)} --> ${bookId}\n`
        }
      }
  
      // end mermaid diagram
      yield '```\n'
    }
    else if (format === 'html') {
      logger.info('render library as a local webpage')
    }
    else {
      throw new Error(`unsupported library export format=${format}`)
    }
  }
}

/**
 * Unified data structure for browsing indexes, stories/texts, profiles.
 * 
 * All items within the library are organized using [relational tagging](https://github.com/ogallagher/relational_tags).
 */
export class Library extends LibraryDescriptor {
  constructor() {
    // library is root of hierarchy; no parent
    super(undefined)

    /**
     * @type {Map<string, LibraryBook>}
     */
    this.books = new Map()

    this.setTags()
    logger.info('created empty library')
  }

  /**
   * Create unique id for the given book.
   * 
   * Current implementation includes the index name and page number, so if the same story id is present
   * on multiple pages, for example, they will are added as separate books.
   * 
   * @param {LibraryBook} book 
   * @returns {string}
   */
  static _getKey(book) {
    return [book.index.name, book.indexPage.pageNumber, book.story.id].join('-')
  }

  /**
   * Adds the book to {@link Library.books}.
   * 
   * If a book with the same {@link Library._getKey key} is already in the library, it is replaced. 
   * 
   * @param {LibraryBook} book 
   */
  addBook(book) {
    const bookKey = Library._getKey(book)
    if (this.books.has(bookKey)) {
      logger.debug('replace existing book %s', bookKey)
      this.books.get(bookKey).unsetTags()
      this.books.delete(bookKey)
    }

    this.books.set(bookKey, book)
    book.setTags()
  }

  /**
   * @param {LibraryBook} book 
   * @returns {boolean} Whether this book is in the library.
   */
  has(book) {
    return this.books.has(Library._getKey(book))
  }

  /**
   * 
   * @param {Map<RelationalTag|LibraryDescriptor, RelationalTagConnection[]>} items 
   * @param {string} sort
   */
  static sortSearchItems(items, sort) {
    return [...items.entries()]
    .toSorted(([a, aConns], [b, bConns]) => {
      let ci = 0
      /**
       * @type {number}
       */
      let cmp = 0
      /**
       * @type {RelationalTagConnection}
       */
      let ac
      /**
       * @type {RelationalTagConnection}
       */
      let bc
      while (cmp === 0 && ci < aConns.length && ci < bConns.length) {
        ac = aConns[ci]
        bc = bConns[ci]

        if (ac.weight !== null && bc.weight !== null) {
          // sort by connection weight
          cmp = ac.weight - bc.weight
        }
        else {
          if (ac.target instanceof RelationalTag && bc.target instanceof RelationalTag) {
            // sort by target tag name
            cmp = ac.target.name.localeCompare(bc.target.name)
          }
          else {
            // sort by target string representation
            cmp = ac.target.toString().localeCompare(bc.target.toString())
          }
        }

        ci ++
      }

      if (cmp === 0) {
        // sort by path length (short first)
        cmp = aConns.length - bConns.length
      }

      if (cmp === 0) {
        if (a instanceof RelationalTag && b instanceof RelationalTag) {
          // sort by result name
          cmp = a.name.localeCompare(b.name)
        }
        else {
          // sort by result string representation
          cmp = a.toString().localeCompare(b.toString())
        }
      }

      return cmp * (sort === 'asc' ? 1 : -1)
    })
  }

  /**
   * Fetch books according to a search query.
   * 
   * @param {RelationalTag} startTag Tag from which to search.
   * @param {string|RegExp|undefined} query Search query.
   * @param {string} sort Sort direction. 
   * 
   * @return {Generator<[LibraryBook, RelationalTagConnection[]]>}
   */
  *getBooks(startTag, query, sort) {
    /**
     * Matched items and the tags graph path to each.
     * @type {Map<RelationalTag, RelationalTagConnection[]>}
     */
    let resultTags
    
    if (query === undefined ) {
      resultTags = new Map([[startTag, []]])
    }
    else {
      resultTags = RelationalTag._search_descendants(
        // from root
        startTag,
        // to descendants
        TYPE_TO_TAG_CHILD,
        // exclude entities, include tags
        false, true,
        query
      )
      logger.info('under parent %s found %s tags matching query %s', startTag.name, resultTags.size, query)
      if (resultTags.size === 0) {
        logger.error('no tags found under parent tag %s matching query %s', startTag.name, query)
        return
      }
    }

    // sort result tags
    let sortedTags = Library.sortSearchItems(resultTags, sort)
    logger.debug('sorted tags %s with first=%s', sort, sortedTags[0])

    // convert tags to books
    /**
     * Each tagged descriptor and its path from a result tag.
     * 
     * @type {Set<LibraryDescriptor>}
     */
    let resultDescriptors = new Set()
    /**
     * Return each book only once, since multiple result descriptors can belong to the same book.
     * 
     * @type {Set<LibraryBook>}
     */
    let resultBooks = new Set()
    let t = 0
    for (let [startTag, pathToStartTag] of sortedTags) {
      if (t < SEARCH_TAGS_MAX) {
        /**
         * @type {Map<LibraryDescriptor, RelationalTagConnection[]>}
         */
        let descriptors = RelationalTag._search_descendants(
          startTag, 
          TYPE_TO_TAG_CHILD,
          // include entities, exclude tags
          true, false,
          // no query
          undefined,
          // prevent duplicates in result
          new Set(resultDescriptors)
        )

        // sort result descriptors
        let sortedDescriptors = Library.sortSearchItems(descriptors, sort)

        let b = 0
        for (let [descriptor, pathToDescriptor] of sortedDescriptors) {
          if (b < SEARCH_TAG_BOOKS_MAX) {
            resultDescriptors.add(descriptor)
            const book = LibraryBook.getBook(descriptor)[0]
            
            // some descriptors do not belong to books (ex StoriesIndex)
            if (book !== undefined && !resultBooks.has(book)) {
              resultBooks.add(book)
              
              yield [
                book,
                pathToStartTag
                .concat(
                  // remove initial recursive connection when linking to end first path
                  pathToDescriptor.filter((conn) => conn.source !== conn.target)
                )
                .filter((conn) => conn.target instanceof RelationalTag)
              ]
            }
          }
          else {
            logger.info('reached books maximum %s for result tag %s', b, startTag.name)
            break
          }
          b++
        }
      }
      else {
        logger.info('reached result tags maximum %s', t)
        break
      }
      t++
    }
  }

  static initTags() {
    this.adoptTag(LibraryBook.t)
    this.adoptTag(StoriesIndex.t)
  }

  setTags() {
    Library.t.connect_to(this)
    // does not call books.setTags because this is done when each book is added.
  }
}

export class LibraryBook extends LibraryDescriptor {
  /**
   * @param {LibraryDescriptor} parent
   * @param {StorySummary} story 
   * @param {IndexPage} indexPage 
   * @param {TextProfile|undefined} profile 
   */
  constructor(parent, story, indexPage, profile) {
    super(parent)

    /**
     * @type {StorySummary}
     */
    this.story = story
    this.story.setParent(this)

    /**
     * @type {IndexPage}
     */
    this.indexPage = indexPage
    this.indexPage.setParent(this)

    /**
     * @type {StoriesIndex}
     */
    this.index = getStoriesIndex(indexPage.indexName)
    // Indexes do not have separate instances for each book, so they belong directly to the library.
    // TODO To determine books associated with an index, the name should reference the indexPage within a book.
    this.index.setParent(parent)

    /**
     * @type {TextProfile|undefined}
     */
    this.profile = profile
    this.profile?.setParent(this)
  }

  /**
   * @param {LibraryDescriptor} descriptor
   * @returns {[LibraryBook|undefined, LibraryDescriptor[]]} The ancestor book to which a descriptor belongs.
   */
  static getBook(descriptor) {
    let parent = descriptor
    let path = [descriptor]
    while (!(parent instanceof LibraryBook)) {
      parent = parent.parent
      if (parent === undefined) {
        break
      }
      else {
        path.push(parent)
      }
    }

    return [parent, path]
  }

  /**
   * Describe this book.
   * 
   * @param {string} indent
   * @param {RelationalTagConnection[]|undefined} searchPath
   * @returns {Generator<string>}
   */
  *describe(indent='', searchPath) {
    yield `${indent}title=${this.story.title} \n`
    yield `${indent}author=${this.story.authorName} \n`
    yield `${indent}id=${this.story.id}\n`

    yield `${indent}index=${this.index} index-page=${this.indexPage.pageNumber} \n`

    if (this.profile !== undefined) {
      yield `${indent}text-profile.file-path=${this.profile.filePath}\n`
      yield `${indent}reading-level=${this.profile.difficulty?.readingLevelName} `
        + `years-of-education=${this.profile.difficulty?.yearsOfEducation}\n`

      yield `${indent}restricted=${this.profile.maturity?.isRestricted} `
      + (this.profile.maturity?.presents.join(' ')) + '\n'

      yield `${indent}topics=` + this.profile.topics.map((topic) => topic.id).join(' ') + '\n'

      yield `${indent}ideologies=` 
      + (
        this.profile.ideologies
        .filter((ideology) => ideology.presence > 0.5)
        .map((ideology) => `${ideology.id}[${ideology.presence}]`)
        .join(' ')
      ) + '\n'
    }
    else {
      yield `${indent}text-profile=<missing>\n`
    }

    if (searchPath !== undefined) {
      yield `${indent}search-path=`
      yield searchPath.map((conn) => {
        // path to book only includes connections to tags
        return (conn.weight !== null ? `[${conn.weight}]` : '') + conn.target.name
      }).join('.')
    }
  }

  static initTags() {
    this.adoptTag(StorySummary.t)
    // currently, index-page is child of both library-book and stories-index tags.
    this.adoptTag(IndexPage.t)
    this.adoptTag(TextProfile.t)
  }

  setTags() {
    this.story.setTags()
    this.indexPage.setTags()
    this.index.setTags()
    this.profile?.setTags()
  }

  unsetTags() {
    this.story.unsetTags()
    this.indexPage.unsetTags()
    this.index.unsetTags()
    this.profile?.unsetTags()
    super.unsetTags()
  }
}
