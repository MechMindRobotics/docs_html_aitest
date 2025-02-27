(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.antoraSearch = {}));
})(this, (function (exports) { 'use strict';

  /**
   * Splitting the text by the given positions.
   * The text within the positions getting the type "mark", all other text gets the type "text".
   * @param {string} text
   * @param {Object[]} positions
   * @param {number} positions.start
   * @param {number} positions.length
   * @param {number} snippetLength Maximum text length for text in the result.
   * @returns {[{text: string, type: string}]}
   */
  function buildHighlightedText (text, positions, snippetLength) {
    const textLength = text.length;
    const validPositions = positions
      .filter((position) => position.length > 0 && position.start + position.length <= textLength);

    if (validPositions.length === 0) {
      return [
        {
          type: 'text',
          text: text.slice(0, snippetLength >= textLength ? textLength : snippetLength) + (snippetLength < textLength ? '...' : ''),
        },
      ]
    }

    const orderedPositions = validPositions.sort((p1, p2) => p1.start - p2.start);
    const range = {
      start: 0,
      end: textLength,
    };
    const firstPosition = orderedPositions[0];
    if (snippetLength && text.length > snippetLength) {
      const firstPositionStart = firstPosition.start;
      const firstPositionLength = firstPosition.length;
      const firstPositionEnd = firstPositionStart + firstPositionLength;

      range.start = firstPositionStart - snippetLength < 0 ? 0 : firstPositionStart - snippetLength;
      range.end = firstPositionEnd + snippetLength > textLength ? textLength : firstPositionEnd + snippetLength;
    }
    const nodes = [];
    if (firstPosition.start > 0) {
      nodes.push({
        type: 'text',
        text: (range.start > 0 ? '...' : '') + text.slice(range.start, firstPosition.start),
      });
    }
    let lastEndPosition = 0;
    const positionsWithinRange = orderedPositions
      .filter((position) => position.start >= range.start && position.start + position.length <= range.end);

    for (const position of positionsWithinRange) {
      const start = position.start;
      const length = position.length;
      const end = start + length;
      if (lastEndPosition > 0) {
        // create text Node from the last end position to the start of the current position
        nodes.push({
          type: 'text',
          text: text.slice(lastEndPosition, start),
        });
      }
      nodes.push({
        type: 'mark',
        text: text.slice(start, end),
      });
      lastEndPosition = end;
    }
    if (lastEndPosition < range.end) {
      nodes.push({
        type: 'text',
        text: text.slice(lastEndPosition, range.end) + (range.end < textLength ? '...' : ''),
      });
    }

    return nodes
  }

  /**
   * Taken and adapted from: https://github.com/olivernn/lunr.js/blob/aa5a878f62a6bba1e8e5b95714899e17e8150b38/lib/tokenizer.js#L24-L67
   * @param lunr
   * @param text
   * @param term
   * @return {{start: number, length: number}}
   */
  function findTermPosition (lunr, term, text) {
    const str = text.toLowerCase();
    const len = str.length;

    for (let sliceEnd = 0, sliceStart = 0; sliceEnd <= len; sliceEnd++) {
      const char = str.charAt(sliceEnd);
      const sliceLength = sliceEnd - sliceStart;

      if ((char.match(lunr.tokenizer.separator) || sliceEnd === len)) {
        if (sliceLength > 0) {
          const value = str.slice(sliceStart, sliceEnd);
          // QUESTION: if we get an exact match without running the pipeline should we stop?
          if (value.includes(term)) {
            // returns the first match
            return {
              start: sliceStart,
              length: value.length,
            }
          }
        }
        sliceStart = sliceEnd + 1;
      }
    }

    // not found!
    return {
      start: 0,
      length: 0,
    }
  }

  /*! js-cookie v3.0.5 | MIT */
  /* eslint-disable no-var */
  function assign (target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        target[key] = source[key];
      }
    }
    return target
  }
  /* eslint-enable no-var */

  /* eslint-disable no-var */
  var defaultConverter = {
    read: function (value) {
      if (value[0] === '"') {
        value = value.slice(1, -1);
      }
      return value.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent)
    },
    write: function (value) {
      return encodeURIComponent(value).replace(
        /%(2[346BF]|3[AC-F]|40|5[BDE]|60|7[BCD])/g,
        decodeURIComponent
      )
    }
  };
  /* eslint-enable no-var */

  /* eslint-disable no-var */

  function init (converter, defaultAttributes) {
    function set (name, value, attributes) {
      if (typeof document === 'undefined') {
        return
      }

      attributes = assign({}, defaultAttributes, attributes);

      if (typeof attributes.expires === 'number') {
        attributes.expires = new Date(Date.now() + attributes.expires * 864e5);
      }
      if (attributes.expires) {
        attributes.expires = attributes.expires.toUTCString();
      }

      name = encodeURIComponent(name)
        .replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent)
        .replace(/[()]/g, escape);

      var stringifiedAttributes = '';
      for (var attributeName in attributes) {
        if (!attributes[attributeName]) {
          continue
        }

        stringifiedAttributes += '; ' + attributeName;

        if (attributes[attributeName] === true) {
          continue
        }

        // Considers RFC 6265 section 5.2:
        // ...
        // 3.  If the remaining unparsed-attributes contains a %x3B (";")
        //     character:
        // Consume the characters of the unparsed-attributes up to,
        // not including, the first %x3B (";") character.
        // ...
        stringifiedAttributes += '=' + attributes[attributeName].split(';')[0];
      }

      return (document.cookie =
        name + '=' + converter.write(value, name) + stringifiedAttributes)
    }

    function get (name) {
      if (typeof document === 'undefined' || (arguments.length && !name)) {
        return
      }

      // To prevent the for loop in the first place assign an empty array
      // in case there are no cookies at all.
      var cookies = document.cookie ? document.cookie.split('; ') : [];
      var jar = {};
      for (var i = 0; i < cookies.length; i++) {
        var parts = cookies[i].split('=');
        var value = parts.slice(1).join('=');

        try {
          var found = decodeURIComponent(parts[0]);
          jar[found] = converter.read(value, found);

          if (name === found) {
            break
          }
        } catch (e) {}
      }

      return name ? jar[name] : jar
    }

    return Object.create(
      {
        set,
        get,
        remove: function (name, attributes) {
          set(
            name,
            '',
            assign({}, attributes, {
              expires: -1
            })
          );
        },
        withAttributes: function (attributes) {
          return init(this.converter, assign({}, this.attributes, attributes))
        },
        withConverter: function (converter) {
          return init(assign({}, this.converter, converter), this.attributes)
        }
      },
      {
        attributes: { value: Object.freeze(defaultAttributes) },
        converter: { value: Object.freeze(converter) }
      }
    )
  }

  var api = init(defaultConverter, { path: '/' });

  /* global CustomEvent, globalThis */

  const config = document.getElementById('search-ui-script').dataset;
  const filterState = {
    facets: {},
    components: {},
    componentVersion: {},
  };
  restoreFilterState();
  const snippetLength = parseInt(config.snippetLength || 100, 10);
  const siteRootPath = config.siteRootPath || '';
  appendStylesheet(config.stylesheet);
  const searchInput = document.getElementById('search-input');
  const searchResultContainer = document.createElement('div');
  searchResultContainer.classList.add('search-result-dropdown-menu', 'hidden');
  searchInput.parentNode.appendChild(searchResultContainer);
  let facetFilterInputs = getFacetFilterInputs();

  function appendStylesheet (href) {
    if (!href) return
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function highlightPageTitle (title, terms) {
    const positions = getTermPosition(title, terms);
    return buildHighlightedText(title, positions, snippetLength)
  }

  function highlightSectionTitle (sectionTitle, terms) {
    if (sectionTitle) {
      const text = sectionTitle.text;
      const positions = getTermPosition(text, terms);
      return buildHighlightedText(text, positions, snippetLength)
    }
    return []
  }

  function highlightKeyword (doc, terms) {
    const keyword = doc.keyword;
    if (keyword) {
      const positions = getTermPosition(keyword, terms);
      return buildHighlightedText(keyword, positions, snippetLength)
    }
    return []
  }

  function highlightText (doc, terms) {
    const text = doc.text;
    const positions = getTermPosition(text, terms);
    return buildHighlightedText(text, positions, snippetLength)
  }

  function getTermPosition (text, terms) {
    const positions = terms
      .map((term) => findTermPosition(globalThis.lunr, term, text))
      .filter((position) => position.length > 0)
      .sort((p1, p2) => p1.start - p2.start);

    if (positions.length === 0) {
      return []
    }
    return positions
  }

  function highlightHit (searchMetadata, sectionTitle, doc) {
    const terms = {};
    for (const term in searchMetadata) {
      const fields = searchMetadata[term];
      for (const field in fields) {
        terms[field] = [...(terms[field] || []), term];
      }
    }
    return {
      pageTitleNodes: highlightPageTitle(doc.title, terms.title || []),
      sectionTitleNodes: highlightSectionTitle(sectionTitle, terms.title || []),
      pageContentNodes: highlightText(doc, terms.text || []),
      pageKeywordNodes: highlightKeyword(doc, terms.keyword || []),
    }
  }

  function createSearchResult (result, store, searchResultDataset) {
    let currentComponent;
    result.forEach(function (item) {
      const ids = item.ref.split('-');
      const docId = ids[0];
      const doc = store.documents[docId];
      let sectionTitle;
      if (ids.length > 1) {
        const titleId = ids[1];
        sectionTitle = doc.titles.filter(function (item) {
          return String(item.id) === titleId
        })[0];
      }
      const metadata = item.matchData.metadata;
      const highlightingResult = highlightHit(metadata, sectionTitle, doc);
      const componentVersion = store.componentVersions[`${doc.component}/${doc.version}`];
      if (componentVersion !== undefined && currentComponent !== componentVersion) {
        const searchResultComponentHeader = document.createElement('div');
        searchResultComponentHeader.classList.add('search-result-component-header');
        const { title, displayVersion } = componentVersion;
        const componentVersionText = `${title}${doc.version && displayVersion ? ` ${displayVersion}` : ''}`;
        searchResultComponentHeader.appendChild(document.createTextNode(componentVersionText));
        searchResultDataset.appendChild(searchResultComponentHeader);
        currentComponent = componentVersion;
      }
      searchResultDataset.appendChild(createSearchResultItem(doc, sectionTitle, item, highlightingResult));
    });
  }

  function createSearchResultItem (doc, sectionTitle, item, highlightingResult) {
    const documentTitle = document.createElement('div');
    documentTitle.classList.add('search-result-document-title');
    highlightingResult.pageTitleNodes.forEach(function (node) {
      let element;
      if (node.type === 'text') {
        element = document.createTextNode(node.text);
      } else {
        element = document.createElement('span');
        element.classList.add('search-result-highlight');
        element.innerText = node.text;
      }
      documentTitle.appendChild(element);
    });
    const documentHit = document.createElement('div');
    documentHit.classList.add('search-result-document-hit');
    const documentHitLink = document.createElement('a');
    documentHitLink.href = siteRootPath + doc.url + (sectionTitle ? '#' + sectionTitle.hash : '');
    documentHit.appendChild(documentHitLink);
    if (highlightingResult.sectionTitleNodes.length > 0) {
      const documentSectionTitle = document.createElement('div');
      documentSectionTitle.classList.add('search-result-section-title');
      documentHitLink.appendChild(documentSectionTitle);
      highlightingResult.sectionTitleNodes.forEach((node) => createHighlightedText(node, documentSectionTitle));
    }
    highlightingResult.pageContentNodes.forEach((node) => createHighlightedText(node, documentHitLink));

    // only show keyword when we got a hit on them
    if (doc.keyword && highlightingResult.pageKeywordNodes.length > 1) {
      const documentKeywords = document.createElement('div');
      documentKeywords.classList.add('search-result-keywords');
      const documentKeywordsFieldLabel = document.createElement('span');
      documentKeywordsFieldLabel.classList.add('search-result-keywords-field-label');
      documentKeywordsFieldLabel.innerText = 'keywords: ';
      const documentKeywordsList = document.createElement('span');
      documentKeywordsList.classList.add('search-result-keywords-list');
      highlightingResult.pageKeywordNodes.forEach((node) => createHighlightedText(node, documentKeywordsList));
      documentKeywords.appendChild(documentKeywordsFieldLabel);
      documentKeywords.appendChild(documentKeywordsList);
      documentHitLink.appendChild(documentKeywords);
    }
    const searchResultItem = document.createElement('div');
    searchResultItem.classList.add('search-result-item');
    searchResultItem.appendChild(documentTitle);
    searchResultItem.appendChild(documentHit);
    searchResultItem.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    return searchResultItem
  }

  /**
   * Creates an element from a highlightingResultNode and add it to the targetNode.
   * @param {Object} highlightingResultNode
   * @param {String} highlightingResultNode.type - type of the node
   * @param {String} highlightingResultNode.text
   * @param {Node} targetNode
   */
  function createHighlightedText (highlightingResultNode, targetNode) {
    let element;
    if (highlightingResultNode.type === 'text') {
      element = document.createTextNode(highlightingResultNode.text);
    } else {
      element = document.createElement('span');
      element.classList.add('search-result-highlight');
      element.innerText = highlightingResultNode.text;
    }
    targetNode.appendChild(element);
  }

  function createNoResult (text) {
    const searchResultItem = document.createElement('div');
    searchResultItem.classList.add('search-result-item');
    const documentHit = document.createElement('div');
    documentHit.classList.add('search-result-document-hit');
    const message = document.createElement('strong');
    message.innerText = 'No results found for query "' + text + '"';
    documentHit.appendChild(message);
    searchResultItem.appendChild(documentHit);
    return searchResultItem
  }

  function clearSearchResults (reset) {
    if (reset === true) searchInput.value = '';
    searchResultContainer.innerHTML = '';
    searchResultContainer.classList.add('hidden');
  }

  function filter (result, documents) {
    const filters = [];
    filterState.facets.forEach((facetFilter) => {
      filters.push(getFacetFilterFn(facetFilter));
    });
    if (filters.length > 0) {
      result = result.filter((item) => {
        return filters.some((filter) => {
          return filter(documents, item)
        })
      });
    }
    return result
  }

  function getFacetFilterFn (facetFilter) {
    const fieldValueMap = facetFilter.split(';').map((filterString) => {
      const [field, value] = filterString.split(':');
      return [field, value]
    });
    // return true if item matches the filter
    return function (documents, item) {
      return fieldValueMap.every(([field, value]) => {
        const ids = item.ref.split('-');
        const docId = ids[0];
        const doc = documents[docId];
        return field in doc && doc[field] === value
      })
    }
  }

  function search (index, documents, queryString) {
    // execute an exact match search
    let query;
    let result = filter(
      index.query(function (lunrQuery) {
        const parser = new globalThis.lunr.QueryParser(queryString, lunrQuery);
        parser.parse();
        query = lunrQuery;
      }),
      documents
    );
    if (result.length > 0) {
      return result
    }
    // no result, use a begins with search
    result = filter(
      index.query(function (lunrQuery) {
        lunrQuery.clauses = query.clauses.map((clause) => {
          if (clause.presence !== globalThis.lunr.Query.presence.PROHIBITED) {
            clause.term = clause.term + '*';
            clause.wildcard = globalThis.lunr.Query.wildcard.TRAILING;
            clause.usePipeline = false;
          }
          return clause
        });
      }),
      documents
    );
    if (result.length > 0) {
      return result
    }
    // no result, use a contains search
    result = filter(
      index.query(function (lunrQuery) {
        lunrQuery.clauses = query.clauses.map((clause) => {
          if (clause.presence !== globalThis.lunr.Query.presence.PROHIBITED) {
            clause.term = '*' + clause.term + '*';
            clause.wildcard = globalThis.lunr.Query.wildcard.LEADING | globalThis.lunr.Query.wildcard.TRAILING;
            clause.usePipeline = false;
          }
          return clause
        });
      }),
      documents
    );
    return result
  }

  function searchIndex (index, store, text) {
    clearSearchResults(false);
    if (text.trim() === '') {
      return
    }
    const result = search(index, store.documents, text);
    const searchResultDataset = document.createElement('div');
    searchResultDataset.classList.add('search-result-dataset');
    searchResultContainer.classList.remove('hidden');
    searchResultContainer.appendChild(searchResultDataset);
    if (result.length > 0) {
      createSearchResult(result, store, searchResultDataset);
    } else {
      searchResultDataset.appendChild(createNoResult(text));
    }
    if (config.additionalFilters === 'true') {
      searchResultContainer.classList.add('has-additional-filter');
      appendFilter(searchResultContainer);
    }
  }

  function confineEvent (e) {
    e.stopPropagation();
  }

  function debounce (func, wait, immediate) {
    let timeout;
    return function () {
      const context = this;
      const args = arguments;
      const later = function () {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    }
  }

  function enableSearchInput (enabled) {
    facetFilterInputs = getFacetFilterInputs();
    if (facetFilterInputs) {
      facetFilterInputs.forEach((facetFilterInput) => {
        facetFilterInput.disabled = !enabled;
      });
    }
    searchInput.disabled = !enabled;
    searchInput.title = enabled ? '' : 'Loading index...';
  }

  function isClosed () {
    return searchResultContainer.childElementCount === 0
  }

  function executeSearch () {
    const debug = 'URLSearchParams' in globalThis && new URLSearchParams(globalThis.location.search).has('lunr-debug');
    const query = searchInput.value;
    const index = searchInput.index;
    try {
      if (!query) return clearSearchResults()
      updateFacetFilter();
      saveFilterState();
      searchIndex(index.index, index.store, query);
    } catch (err) {
      if (err instanceof globalThis.lunr.QueryParseError) {
        if (debug) {
          console.debug('Invalid search query: ' + query + ' (' + err.message + ')');
        }
      } else {
        console.error('Something went wrong while searching', err);
      }
    }
  }

  function toggleSearch () {
    searchInput.focus();
    if (!isClosed()) {
      executeSearch();
    }
  }

  function appendFilter (target) {
    const filterPanel = document.createElement('div');
    filterPanel.id = 'filter-panel';
    filterPanel.classList.add('search-filter-panel');
    filterPanel.classList.add('search-result-component-header');

    searchInput.metaData.components.forEach((component) => {
      addFilterOption(component, filterPanel);
    });

    target.appendChild(filterPanel);
  }

  function addFilterOption (component, target) {
    const id = component.name;
    const filterOption = document.createElement('div');
    const label = `${component.title}`;
    filterOption.classList.add('search-filter-option');
    const filterOptionCheckbox = document.createElement('input');
    filterOptionCheckbox.type = 'checkbox';
    filterOptionCheckbox.id = id;

    const filterOptionLabel = document.createElement('label');
    filterOptionLabel.for = id;
    filterOptionLabel.innerText = label;
    filterOption.appendChild(filterOptionCheckbox);
    filterOption.appendChild(filterOptionLabel);

    const versionSelector = document.createElement('select');
    const allOption = document.createElement('option');
    allOption.innerText = 'All (*)';
    allOption.setAttribute('data-facet-filter', `component:${component.name}`);
    versionSelector.appendChild(allOption);
    versionSelector.componentName = component.name;
    component.versions.forEach((versionData) => {
      const option = document.createElement('option');
      const versionFilter = `component:${component.name};version:${versionData.version}`;
      option.innerText = versionData.displayVersion;
      option.componentVersion = versionData.version;
      option.setAttribute('data-facet-filter', versionFilter);
      if (filterState.componentVersion[component.name] === versionData.version) {
        option.selected = true;
      }
      versionSelector.appendChild(option);
    });

    versionSelector.addEventListener('change', (event) => {
      filterState.componentVersion[versionSelector.componentName] = event.target.value;
      toggleSearch();
    });

    if (filterState.components[id]) {
      filterOptionCheckbox.checked = true;
      filterOption.appendChild(versionSelector);
    }

    filterOptionCheckbox.addEventListener('change', () => {
      filterState.components[id] = filterOptionCheckbox.checked;
      if (filterOptionCheckbox.checked) {
        filterOption.appendChild(versionSelector);
      } else {
        filterOption.removeChild(versionSelector);
      }
      toggleSearch();
    });

    target.appendChild(filterOption);
  }

  function getFacetFilterInputs () {
    return document.querySelectorAll('#search-field input[type=checkbox][data-facet-filter]')
  }

  function updateFacetFilter () {
    // checked matches checked checkboxes and selected options
    const facetNodes = document.querySelectorAll('#search-field [data-facet-filter]:checked');
    filterState.facets = Array.from(facetNodes).map((node) => node.dataset.facetFilter);
  }

  function saveFilterState () {
    api.set('filter-components', JSON.stringify(filterState.components));
    api.set('filter-components-version', JSON.stringify(filterState.componentVersion));
  }

  function restoreFilterState () {
    try {
      filterState.components = JSON.parse(api.get('filter-components')) || {};
      filterState.componentVersion = JSON.parse(api.get('filter-components-version')) || {};
    } catch (error) {
      filterState.components = {};
      filterState.componentVersion = {};
    }
  }

  function initSearch (lunr, data, metaData) {
    const start = performance.now();
    const index = { index: lunr.Index.load(data.index), store: data.store };
    enableSearchInput(true);
    searchInput.dispatchEvent(
      new CustomEvent('loadedindex', {
        detail: {
          took: performance.now() - start,
        },
      })
    );
    searchInput.addEventListener(
      'keydown',
      debounce(function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') return clearSearchResults(true)
        executeSearch();
      }, 100)
    );
    searchInput.addEventListener('click', confineEvent);
    searchInput.index = index;
    searchInput.metaData = metaData;
    searchResultContainer.addEventListener('click', confineEvent);
    if (facetFilterInputs) {
      facetFilterInputs.forEach((facetFilterInput) => {
        facetFilterInput.parentElement.addEventListener('click', confineEvent);
        facetFilterInput.addEventListener('change', () => toggleSearch());
      });
    }
    document.documentElement.addEventListener('click', clearSearchResults);
  }

  // disable the search input until the index is loaded
  enableSearchInput(false);

  exports.initSearch = initSearch;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
