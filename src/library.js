import { RelationalTag } from 'relational_tags'
import { parse as parseExpr } from 'subscript'
import { LibraryDescriptor } from './libraryDescriptor.js'
import { Difficulty, Ideology, Maturity, TextProfile, Topic } from './textProfile.js'
import { getStoriesIndex } from './storiesIndex/index.js'
import { StoriesIndex } from './storiesIndex/storiesIndex.js'
import { StorySummary } from './storySummary.js'
import { IndexPage } from './indexPage.js'
import { loadText, loadProfile, getProfilePath } from './reader.js'
import { SEARCH_TAGS_MAX, SEARCH_TAG_BOOKS_MAX, SEARCH_OP_AND, SEARCH_OP_GROUP, SEARCH_OP_OR, SEARCH_OP_COMPOSE, SEARCH_OP_EQ, SEARCH_T, SEARCH_Q, TYPE_TO_TAG_CHILD, TYPE_TO_TAG_PARENT, SEARCH_OP_NEQ, SEARCH_OP_NOT, TAGS_STMT_DELIM, TAGS_ADD, TAGS_DEL, TAGS_CONN, TAGS_DISC, TAGS_ACCESS, TAGS_T, TAGS_S } from './config.js'
import { compileRegexp } from './stringUtil.js'
import { LibrarySearchEntry } from './librarySearchEntry.js'
import * as progress from './progress.js'
import { collectionIterator, collectionSize } from './collectionUtil.js'
/**
 * @typedef {import('pino').Logger} Logger
 * @typedef {import('cli-progress').SingleBar} SingleBar
 * @typedef {Array<string|SearchExpression>} SearchExpression Multi term expression.
 * @typedef {import('relational_tags').RelationalTagConnection} RelationalTagConnection
 * @typedef {import('./librarySearchEntry.js').BookReference} BookReference
 */

/**
 * @type {Logger}
 */
let logger

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
  LibrarySearchEntry.t = RelationalTag.new('library-search-entry')
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
  LibrarySearchEntry.initTags()
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
 * @returns All descendant tags and books of custom-tag.
 */
export function getCustomTags() {
  /**
   * @type {Map<RelationalTag, RelationalTagConnection[]>}
   */
  let customTags = RelationalTag._search_descendants(Library.tCustom, TYPE_TO_TAG_CHILD, false, true, null)
  logger.info('found %s descendant tags of %', customTags.size, Library.tCustom.name)

  return [Library.tCustom, ...customTags.keys()]
}

/**
 * Load serialized custom tags and connected books.
 * 
 * @param {Library} library
 * @param {string} json 
 * @param {boolean} tagsAreStringified
 * 
 * @returns {RelationalTag[]}
 */
export function loadCustomTags(library, json) {
  let customTags = RelationalTag.load_json(json, true, false)
  logger.info('loaded %s descendant tags of %s', customTags.length, Library.tCustom.name)

  // assign deserialized LibraryBook raw object tags to LibraryBook instances
  /**
   * @type {LibraryBook[]}
   */
  let taggedBooks = RelationalTag.search_entities_by_tag(
    Library.tCustom, TYPE_TO_TAG_CHILD, false
  ).filter((b) => !(b instanceof LibraryBook))
  logger.info('loaded %s descendant raw book objects of %s', taggedBooks.length, Library.tCustom)
  for (let bookObj of taggedBooks) {
    // get book
    const book = library.getBook(bookObj.indexPage.indexName, bookObj.story.id)

    // assign bookObj tags to book
    for (let tag of RelationalTag._tagged_entities.get(bookObj).keys()) {
      RelationalTag.connect(tag, book)
    }

    // remove raw bookObj from tags graph
    RelationalTag.delete_entity(bookObj)
  }

  return customTags
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

  const pb = progress.start()
  progress.log(pb, 'loading local library')
  const pbPages = progress.addBar(pb, 'index pages', indexPages.length)

  for (let page of indexPages) {
    logger.debug('create LibraryBook instance for each story in page-path=%s', page.filePath)
    let pPage = loadText(page.filePath)
    .then(JSON.parse)
    .then(
      /**
       * @param {StorySummary[]} storySummaries 
       */
      (storySummaries) => {
        const pbStories = progress.addBar(pb, page.toString() + ' stories', storySummaries.length)

        return Promise.all(storySummaries.map(async (story) => {
          /**
           * @type {TextProfile|undefined}
           */
          let profile
          try {
            profile = await getProfilePath(story.id, page.indexName, profilesDir).then(loadProfile)
          }
          catch (err) {
            logger.debug('no profile found for story=%s', story.id)
            logger.trace(err)
          }

          pbStories.increment()
          return {story: StorySummary.fromData(story), profile}
        }))
      }
    )
    .then((storyProfiles) => {
      const pbBooks = progress.addBar(pb, page.toString() + ' books', storyProfiles.length)
      storyProfiles.forEach(({story, profile}) => {
        library.addBook(new LibraryBook(library, story, page, profile))
        pbBooks.increment()
      })
    })
    .then(() => {
      pbPages.increment()
    })

    pPages.push(pPage)
  }

  await Promise.all(pPages)
  progress.stop(pb)
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
    // split on illegible chars, allowing underscores and hyphens within words
    .split(/[^a-z0-9가-힣áéíóúäëïöüÿç\-_]+/)
    // drop small words
    .filter((w) => w.length >= TAG_TEXT_WORD_LEN_MIN)
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
 * Export/render the given `Library` instance as a content string in the requested format, as well as
 * a list of {@linkcode LibrarySearchEntry} instances as a side-effect file.
 * 
 * @param {Library} library 
 * @param {string} format
 * @param {string|undefined} startTagName Tag from which to search.
 * @param {string|RegExp|undefined} query Tag search query.
 * @param {string|undefined} searchExpr Tag search expression.
 * @param {string|undefined} sort Sort direction. 
 * 
 * @returns {Generator<string, BookReference[]>} Yields strings to be written to the render
 * file. On completion, returns a list of library book references, if applicable.
 */
export function *exportLibrary(library, format, startTagName, query, searchExpr, sort) {
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
    const bookGen = (
      searchExpr === undefined
      ? library.getBooks(startTag, query, sort)
      : library.execSearchExpression(searchExpr, sort)
    )
    /**
     * @type {LibraryBook}
     */
    let book
    /**
     * @type {RelationalTagConnection[]}
     */
    let bookSearchPath
    /**
     * @type {BookReference[]}
     */
    let bookRefs = []

    if (format === 'txt') {
      logger.info('render library as a list books')
  
      yield `=== books in library for start-tag=${startTagName} query=${query} search-expr="${searchExpr}" sort=${sort}\n\n`
      for (
        let next = bookGen.next(); 
        !next.done && ([book, bookSearchPath] = next.value);
        next = bookGen.next()
      ) {
        bookRefs.push(LibrarySearchEntry.getBookRef(book))

        yield '- \n'
        for (let chunk of book.describe('  ', bookSearchPath)) {
          yield chunk
        }
  
        yield '\n'
      }
      yield `===\n`
    }
    else if (format === 'md') {
      logger.info('render library books as markdown with embedded mermaid')
  
      // header
      yield '# doc-level library export\n\n'

      // save input
      yield `## input\n\n`
      yield `\`--show-library ${format} --tag ${startTagName} --query ${query} --search-expr="${searchExpr}" --sort ${sort}\`\n`
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
        bookRefs.push(LibrarySearchEntry.getBookRef(book))

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

    return bookRefs
  }
}

/**
 * Unified data structure for browsing indexes, stories/texts, profiles.
 * 
 * All items within the library are organized using [relational tagging](https://github.com/ogallagher/relational_tags).
 */
export class Library extends LibraryDescriptor {
  /**
   * Parent tag of all user defined custom tags.
   */
  static get tCustom() { return RelationalTag.get('custom-tag') }

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
   * @param {[string, string|[undefined,string], string|[undefined,string]]} terms Terms of the condition.
   * Literals are represented as a 2-element array where arr[0] is an undefined operator.
   * They are not noted in param type hint, but `a` and `b` can also be nested group expressions,
   * each with a single term.
   * 
   * @returns {[string, RelationalTag|undefined, string|RegExp|undefined]} `[op, t, q]`.
   */
  static getSearchCondition([eq, a, b]) {
    // resolve extra nested groups
    while (eq === SEARCH_OP_GROUP) {
      [eq, a, b] = a
    }
    while (Array.isArray(a) && a[0] === SEARCH_OP_GROUP) {
      a = a[1]
    }
    while (Array.isArray(b) && b[0] === SEARCH_OP_GROUP) {
      b = b[1]
    }

    // flip backward condition
    if (b === SEARCH_T || b === SEARCH_Q) {
      let temp = a
      a = b
      b = temp
    }

    if (b.length !== 2) {
      throw new Error(
        `expected ${b} to be a literal term represented by length-2 array`, {
          cause: [eq, a, b]
        }
      )
    }

    if (a === SEARCH_T) {
      return [eq, RelationalTag.get(b[1]), undefined]
    }
    else if (a === SEARCH_Q) {
      let bRegexp = compileRegexp(b[1])
      return [eq, undefined, bRegexp === undefined ? b[1] : bRegexp]
    }
    else {
      throw new Error(
        `in search condition ${eq} ${a} ${b} one of terms must be ${SEARCH_T} or ${SEARCH_Q}`
      )
    }
  }
  
  /**
   * @param {SearchExpression} expr 
   * @param {string|undefined} sort
   * 
   * @returns {Generator<[LibraryBook, RelationalTagConnection[]]}
   */
  *execSearchExpression(expr, sort) {
    if (!Array.isArray(expr)) {
      logger.debug('raw search expr="%s"', expr)
      /**
       * @type {SearchExpression}
       */
      expr = parseExpr(expr)
      logger.debug('parsed search expr as %o', expr)
    }
    // else, expression is already parsed and ready for execution

    if (!Array.isArray(expr)) {
      throw new Error(`failed to parse search expression ${expr}`, {
        cause: expr
      })
    }

    const op = expr[0]
    const a = expr[1]
    const b = expr[2]

    if (op === SEARCH_OP_GROUP) {
      for (let res of this.execSearchExpression(a, sort)) {
        yield res
      }
    }
    else if (op === SEARCH_OP_NOT && b === undefined) {
      // unary set complement
      let booksNot = new Map([...this.execSearchExpression(a, undefined)])
      for (let book of this.books.values()) {
        if (!booksNot.has(book)) {
          yield [book, []]
        }
      }
    }
    else if (op === SEARCH_OP_AND || op === SEARCH_OP_OR || (op === SEARCH_OP_NOT && b !== undefined)) {
      // set operations
      // I think we could use Map.<set-operation> here, but prefer to loop through manually to yield on demand
      let resA = this.execSearchExpression(a, sort)
      let resB = this.execSearchExpression(b, sort)

      if (op === SEARCH_OP_AND) {
        // AND = set intersection
        let booksB = new Map([...resB])
        
        for (let [book, _pathToBook] of resA) {
          if (booksB.has(book)) {
            yield [book, _pathToBook]
          }
          // else, not within intersection
        }
      }
      else if (op === SEARCH_OP_OR) {
        // OR = set union
        /**
         * @type {Set<LibraryBook>}
         */
        let books = new Set()
        
        for (let [book, path] of resA) {
          if (!books.has(book)) {
            books.add(book)
            yield [book, path]
          }
        }

        for (let [book, path] of resB) {
          if (!books.has(book)) {
            books.add(book)
            yield [book, path]
          }
        }
      }
      else {
        // NOT = set difference
        let booksB = new Map([...resB])

        // I think we could use Map.intersection here, but prefer to loop through manually to yield on demand
        for (let [book, _pathToBook] of resA) {
          if (!booksB.has(book)) {
            yield [book, _pathToBook]
          }
          // else, not within intersection
        }
      }
    }
    else if (op === SEARCH_OP_COMPOSE) {
      // composite condition (tag + query)
      let [op1, t1, q1] = Library.getSearchCondition(a, sort)
      let [op2, t2, q2] = Library.getSearchCondition(b, sort)

      if (t1 !== undefined && t2 !== undefined) {
        throw new Error(
          `1 composite condition ${expr} cannot define 2 start tags`
        )
      }
      else if (q1 !== undefined && q2 !== undefined) {
        throw new Error(
          `1 composite condition ${expr} cannot define 2 tag patterns/queries`
        )
      }
      else {
        for (let res of this.getBooks(
          t1 !== undefined ? t1 : t2, 
          t1 !== undefined ? q2 : q1, 
          sort, 
          op1 === SEARCH_OP_NEQ, 
          op2 === SEARCH_OP_NEQ
        )) {
          yield res
        }
      }
    }
    else if (op === SEARCH_OP_EQ || op === SEARCH_OP_NEQ) {
      // single condition
      let [_op, t, q] = Library.getSearchCondition(expr, sort)
      if (t === undefined) {
        t = this
      }
      for (let res of this.getBooks(
        t, q, sort, 
        t !== undefined && op === SEARCH_OP_NEQ,
        q !== undefined && op === SEARCH_OP_NEQ
      )) {
        yield res
      }
    }
    else {
      throw new Error(`unsupported operator ${op} in search expression ${expr}`)
    }
  }

  /**
   * @typedef {RelationalTag|LibraryBook} TaggingNode
   */
  /**
   * Execute tagging expression of one or more tag operation statements.
   * 
   * Note that unlike doc-level tags, custom tags will connect directly to {@linkcode LibraryBook} instances, 
   * instead of their descriptors.
   * 
   * @param {SearchExpression} expr 
   * @param {boolean} accessNewTag If expression contains a tag reference, whether the tag is allowed not
   * to exist yet.
   * 
   * @returns {Generator<TaggingNode|[TaggingNode, TaggingNode]>}
   */
  *execTaggingExpression(expr, accessNewTag=false) {
    if (!Array.isArray(expr)) {
      logger.debug('raw tagging expr="%s"', expr)
      /**
       * @type {SearchExpression}
       */
      expr = parseExpr(expr)
      logger.debug('parsed tagging expr as %o', expr)
    }
    // else, expression already parsed and ready for execution

    if (!Array.isArray(expr)) {
      throw new Error(`failed to parse tagging expression ${expr}`, {
        cause: expr
      })
    }

    const [op, a, b] = expr

    if (op === TAGS_STMT_DELIM) {
      const stmts = expr.slice(1).filter((term) => term !== null)
      logger.debug('parsed %s statements from tagging expression %o', stmts.length, expr)
      for (let stmt of stmts) {
        for (let res of this.execTaggingExpression(stmt)) {
          yield res
        }
      }
    }
    else if ([TAGS_ADD, TAGS_DEL, TAGS_CONN, TAGS_DISC].indexOf(op) !== -1) {
      let tag = [...this.execTaggingExpression(a, op === TAGS_ADD || op === TAGS_DEL)][0]
      if (!(tag instanceof RelationalTag)) {
        throw new Error(`cannot create ${tag} if not instance of RelationalTag`)
      }
      
      if (op === TAGS_ADD) {
        Library.tCustom.connect_to(tag, TYPE_TO_TAG_CHILD)
        console.log(`create tag if not exists "${getTagLineageName(tag, '.', '...')}"`)
        yield tag
      }
      else if (op === TAGS_DEL) {
        console.log(`delete tag if exists "${getTagLineageName(tag, '.', '...')}"`)
        RelationalTag.delete(tag)
        yield tag
      }
      else if (op === TAGS_CONN || op === TAGS_DISC) {
        let target = [...this.execTaggingExpression(b)][0]
        if (!(target instanceof RelationalTag || target instanceof LibraryBook)) {
          throw new Error(`cannot connect to ${target} if not a tag or story`)
        }

        if (op === TAGS_CONN) {
          let conn = RelationalTag.connect(tag, target, (target instanceof RelationalTag) ? TYPE_TO_TAG_CHILD : undefined)
          console.log(`create connection ${conn}`)
        }
        else if (op === TAGS_DISC) {
          RelationalTag.disconnect(tag, target)
          console.log(`disconnect ${tag} from ${target}`)
        }

        yield [tag, target]
      }
    }
    else if (op === TAGS_ACCESS) {
      // get tag
      if (a === TAGS_T) {
        if (b.length !== 2) {
          throw new Error(`failed to parse tag reference ${JSON.stringify(b)} from access expression ${JSON.stringify(expr)}`)
        } 

        yield RelationalTag.get(b[1], accessNewTag)
      }
      // get book
      else {
        const [sExpr, sIdExpr] = [a, b]
        const [_op, sVar, siNameExpr] = sExpr

        if (sIdExpr.length !== 2) {
          throw new Error(`failed to parse story reference ${JSON.stringify(sExpr)} from access expression ${JSON.stringify(expr)}`)
        }
        const storyId = sIdExpr[1]

        if (sVar !== TAGS_S || siNameExpr.length !== 2) {
          throw new Error(`failed to parse stories index reference ${JSON.stringify(siNameExpr)} from access expression ${JSON.stringify(expr)}`)
        }
        const indexName = getStoriesIndex(siNameExpr[1]).name

        yield this.getBook(indexName, storyId)
      }
    }
    else {
      throw new Error(`unsupported tagging operator ${op} in expression "${expr.join(' ')}"`)
    }
  }

  /**
   * Fetch books according to a search query.
   * 
   * @param {RelationalTag} startTag Tag from which to search.
   * @param {string|RegExp|undefined} query Search query.
   * @param {string|undefined} sort Sort direction. 
   * @param {boolean} excludeStartTag Whether the provided `startTag` should be excluded (negative condition).
   * @param {boolean} excludeQuery Whether tags matching the provided `query` should be excluded (negative condition).
   * 
   * @returns {Generator<[LibraryBook, RelationalTagConnection[]]>}
   */
  *getBooks(startTag, query, sort, excludeStartTag=false, excludeQuery=false) {
    /**
     * Matched tags and the graph path to each.
     * 
     * Type is converted from `Map` to `Array` if `sort` is applied.
     * 
     * @type {Map<RelationalTag, RelationalTagConnection[]>|[RelationalTag, RelationalTagConnection[]][]}
     */
    let includeTags = new Map()
    /**
     * Matched tags and the graph path to each, whose books should be excluded
     * @type {Set<RelationalTag>}
     */
    const excludeTags = new Set()

    // populate tags to include and exclude
    if (excludeStartTag) {
      excludeTags.add(startTag)
    }

    if (excludeQuery) {
      let excludeQueryTagCount = 0
      for (let tag of RelationalTag._search_descendants(
        // from root
        Library.t,
        // to descendants
        TYPE_TO_TAG_CHILD,
        // only tags
        false, true,
        query
      ).keys()) {
        excludeTags.add(tag)
        excludeQueryTagCount++
      }
      logger.info('found %s exclude tags matching query %s', excludeQueryTagCount, query)
    }
    
    if ((query === undefined || excludeQuery) && startTag !== undefined && !excludeStartTag) {
      includeTags.set(startTag, [])
    }
    
    if (query !== undefined && !excludeQuery) {
      let _startTag = excludeStartTag ? Library.t : startTag
      let includeQueryTagCount = 0
      for (let [tag, pathToTag] of RelationalTag._search_descendants(
        // from ancestor
        _startTag,
        // to descendants
        TYPE_TO_TAG_CHILD,
        // only tags
        false, true,
        query
      ).entries()) {
        includeTags.set(tag, pathToTag)
        includeQueryTagCount++
      }
      logger.info('under parent %s found %s include tags matching query %s', _startTag.name, includeQueryTagCount, query)
      if (includeTags.size === 0) {
        logger.error('no tags found under parent tag %s matching query %s', _startTag.name, query)
        return
      }
    }

    // remove tags connected to excluded start tags
    if (excludeStartTag) {
      for (let includeTag of [...includeTags.keys()]) {
        if (RelationalTag._search_descendants(startTag, TYPE_TO_TAG_CHILD, false, true, includeTag.name).size > 0) {
          logger.debug('exclude tag %s connected to ancestor %s', includeTag, startTag)
          includeTags.delete(includeTag)
        }
      }
    }

    // sort include tags. If sorted, converts to ordered array.
    if (sort !== undefined) {
      includeTags = Library.sortSearchItems(includeTags, sort)
      logger.debug('sorted include tags %s', sort)
    }

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

    // if no include tags defined, start with set of all books and remove results of excludeTags
    let excludeWithoutInclude = (collectionSize(includeTags) === 0 && collectionSize(excludeTags) > 0)
    if (excludeWithoutInclude) {
      resultBooks = new Set(this.books.values())
    }
    // else, connections to excludeTags were already removed from includeTags

    let t = 0
    for (
      let [startTag, pathToStartTag] of /** @type {[RelationalTag, RelationalTagConnection[]|RelationalTag][]} */ (
        excludeWithoutInclude ? excludeTags.entries() : collectionIterator(includeTags)
      )
    ) {
      if (t < SEARCH_TAGS_MAX || excludeWithoutInclude) {
        /**
         * Tagged entities associated to books.
         * 
         * Type is converted from `Map` to `Array` if `sort` is applied.
         * 
         * @type {Map<LibraryDescriptor, RelationalTagConnection[]>|[LibraryDescriptor, RelationalTagConnection[]][]}
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

        if (!excludeWithoutInclude) {
          // remove descriptors connected to excluded tags
          if (excludeTags.size > 0) {
            for (let descriptor of [...descriptors.keys()]) {
              for (let excludeTag of excludeTags.values()) {
                if (RelationalTag.search_tags_of_entity(descriptor, excludeTag.name, TYPE_TO_TAG_PARENT, false).length > 0) {
                  logger.debug('exclude descriptor %s connected to %s', descriptor, excludeTag)
                  descriptors.delete(descriptor)
                }
              }
            }
          }

          // sort result descriptors
          if (sort !== undefined) {
            descriptors = Library.sortSearchItems(descriptors, sort)
          }
        }

        let b = 0
        for (
          let [descriptor, pathToDescriptor] of
          /** @type {[LibraryDescriptor, RelationalTagConnection[]][]} */ (collectionIterator(descriptors))
        ) {
          if (b < SEARCH_TAG_BOOKS_MAX || excludeWithoutInclude) {
            resultDescriptors.add(descriptor)
            const book = LibraryBook.getBook(descriptor)[0]
            
            // some descriptors do not belong to books (ex StoriesIndex)
            if (book !== undefined) {
              if (excludeWithoutInclude) {
                resultBooks.delete(book)
              }
              else if (!resultBooks.has(book)) {
                resultBooks.add(book)
              
                yield [
                  book,
                  (Array.isArray(pathToStartTag) ? pathToStartTag : [])
                  .concat(
                    // remove initial recursive connection when linking to end first path
                    pathToDescriptor.filter((conn) => conn.source !== conn.target)
                  )
                  .filter((conn) => conn.target instanceof RelationalTag)
                ]
              }
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

    // return all books that were not excluded
    if (excludeWithoutInclude) {
      logger.info('yield %s non excluded result books without tag paths', resultBooks.size)
      for (let book of resultBooks.values()) {
        yield [book, []]
      }
    }
  }

  /**
   * Get a book by index name and story id. 
   * 
   * Implemented using tag search, but performance could be improved by updating `Library._getKey` to exclude
   * page number from a book's unique key.
   * 
   * @param {string} indexName 
   * @param {string} storyId 
   * 
   * @returns {LibraryBook}
   */
  getBook(indexName, storyId) {
    const resBooks = [
      ...this.execSearchExpression([
        `t == '${StorySummary.tId.name}' ^ q == '${storyId}'`,
        `t == '${StoriesIndex.tName.name}' ^ q == '${indexName}'`
      ].join(' && '))
    ]
    if (resBooks.length !== 1) {
      throw new Error(`failed to get single book for index-name=${indexName} story-id=${storyId}`, {
        cause: {
          resultBooks: resBooks
        }
      })
    }

    return resBooks[0][0]
  }

  static initTags() {
    this.adoptTag(LibraryBook.t)
    this.adoptTag(StoriesIndex.t)
    this.adoptTag(Library.tCustom)
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
   * @param {IndexPage} indexPageProto Reference to an index page from which an instance is cloned
   * and adopted by this book.
   * @param {TextProfile|undefined} profile 
   */
  constructor(parent, story, indexPageProto, profile) {
    super(parent)

    /**
     * @type {StorySummary}
     */
    this.story = story
    this.story.setParent(this)

    /**
     * @type {IndexPage}
     */
    this.indexPage = IndexPage.fromData(indexPageProto)
    this.indexPage.setParent(this)

    /**
     * @type {StoriesIndex}
     */
    this.index = getStoriesIndex(indexPageProto.indexName)
    // Indexes do not have separate instances for each book, so they belong directly to the library.
    // To determine books associated with an index, the name should reference the indexPage within a book.
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
      yield `${indent}text-profile.file-path=[${this.profile.filePath}]\n`
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
      }).join('.') + '\n'
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

  toString() {
    return `LibraryBook[id=${this.story.id} title=${this.story.title}]`
  }
}
