"use strict";

import { LitElement, html, css, unsafeCSS } from 'lit-element';
import { wrapCss } from './misc';
import ndjson from 'fetch-ndjson';

import FlexSearch from 'flexsearch';

import { getTS } from './pageutils';

import fasSearch from '@fortawesome/fontawesome-free/svgs/solid/search.svg';
import fasAngleDown from '@fortawesome/fontawesome-free/svgs/solid/angle-down.svg';


// ===========================================================================
class Pages extends LitElement
{
  constructor() {
    super();
    this.filteredPages = [];
    this.sortedPages = [];
    this.query = "";
    this.flex = null;
    this.newQuery = null;
    this.loading = false;
    this.updatingSearch = false;

    this.currList = 0;

    this.active = false;
    this.editable = false;
    this.changeNeeded = false;
    
    this.selectedPages = new Set();

    this.menuActive = false;

    this.sortKey = null;
    this.sortDesc = null;

    this.isSidebar = false;
    this.url = "";
    this.ts = "";
  }

  static get sortKeys() {
    return [
      {
        "key": "",
        "name": "Best Match",
      },
      {
        "key": "title",
        "name": "Title"
      },
      {
        "key": "ts",
        "name": "Date"
      }
    ];
  }

  static get properties() {
    return {
      active: { type: Boolean },
      collInfo: { type: Object },
      currList: { type: Number },
      filteredPages: { type: Array },
      sortedPages: { type: Array },

      query: { type: String },
      defaultKey: { type: String },

      loading: { type: Boolean },
      updatingSearch: { type: Boolean },
      editable: { type: Boolean },

      selectedPages: { type: Set },
      allSelected: { type: Boolean },

      menuActive: {type: Boolean },

      sortKey: { type: String },
      sortDesc: { type: Boolean },

      isSidebar: { type: Boolean },
      url: { type: String },
      ts: { type: String }
    }
  }

  _timedUpdate() {
    if (this.newQuery !== null) {
      this.query = this.newQuery;
      this.newQuery = null;
      this.filter();
    }
  }

  async updated(changedProperties) {
    if (changedProperties.has("collInfo")) {
      this.updateTextSearch();

    } else if (changedProperties.has("query")) {

      if (this.query && !changedProperties.get("query")) {
        this.sortKey = null;
        this.sortDesc = null;
      }

      this.filter();

    } else if (changedProperties.has("currList")) {
      this.filter();
    }
    if (changedProperties.has("active") && this.active) {
      if (this.changeNeeded) {
        this.filter();
      }
    }

    if (changedProperties.has("sortedPages") && this.isSidebar) {
      //if (await this.updateComplete) {
        const selected = this.renderRoot.querySelector(".current");
        if (selected) {
          const opts = {behavior: "smooth", block: "nearest", inline: "nearest"};
          setTimeout(() => selected.scrollIntoView(opts), 100);
        }
      //}
    }
  }

  onChangeQuery(event) {
    this.newQuery = event.currentTarget.value;
    //this.loading = true;
    if (this._ival) {
      window.clearTimeout(this._ival);
    }
    this._ival = window.setTimeout(() => this._timedUpdate(), 250);
  }

  async filter() {
    if (this.loading) {
      return;
    }
    if (!this.active) {
      this.changeNeeded = true;
    }
    this.loading = true;
    if (this.flex && this.query) {
      const result = await this.flex.search(this.query, {limit: 25});

      this.filteredPages = result;
    } else {
      this.filteredPages = [...this.collInfo.pages];
    }

    if (this.currList !== 0) {
      await this.filterCurated();
    }

    this.loading = false;
    this.changeNeeded = false;
    const data = {query: this.query, currList: this.currList};
    this.sendChangeEvent(data);
  }

  async filterCurated() {
    const resp = await fetch(`${this.collInfo.apiPrefix}/curated/${this.currList}`);
    const json = await resp.json();

    const curated = [];

    for (const c of json.curated) {
      for (const p of this.filteredPages) {
        if (p.id === c.page) {
          curated.push(p);
          break;
        }
      }
    }

    this.filteredPages = curated;
  }

  sendChangeEvent(data) {
    this.dispatchEvent(new CustomEvent("coll-tab-nav", {detail: {data}}));
  }

  async updateTextSearch() {
    if (this.updatingSearch) {
      return;
    }

    this.updatingSearch = true;
    let count = 0;

    try {
      const flex = new FlexSearch({
        doc: {
          id: "id",
          field: ["url", "title", "text"],
        },
        async: true
      });

      this.flex = flex;

      const cache = await caches.open("cache:" + this.collInfo.coll);

      const indexUrl = `${this.collInfo.apiPrefix}/textIndex`;

      let resp = await cache.match(indexUrl);

      if (!resp || !Number(resp.headers.get("Content-Length"))) {
        resp = await fetch(`${this.collInfo.apiPrefix}/textIndex`);
        if (resp.status === 200 && Number(resp.headers.get("Content-Length"))) {
          cache.put(indexUrl, resp.clone());
        }
      }

      let lines = [];

      async function flush() {
        let curr = lines;
        lines = [];
        await flex.add(curr);
        console.log("added " + count + " " + curr.length);
        console.log(flex.info());
      }

      for await (const line of ndjson(resp.body.getReader())) {
        if (!line.text) {
          continue;
        }

        line.id = ++count;
        lines.push(line);
        if ((count % 100) === 0) {
          await flush();
        }
      }

      await flush();

    } finally {
      if (count === 0) {
        this.flex.add(this.collInfo.pages);
      }

      this.updatingSearch = false;
    }

    await this.filter();
  }

  static get styles() {
    return wrapCss(css`
      :host {
        width: 100%;
        height: 100%;
        display: flex;
        min-width: 0px;
        flex-direction: column;
        box-sizing: border-box !important;
      }

      .main.columns {
        width: 100%;
        justify-self: stretch;
        min-height: 0px;
        margin: 0px;
      }

      .header.columns {
        width: 100%;
        margin-bottom: 0px;
      }
      .header a {
        color: black;
      }

      .header .column.pagetitle {
        margin-left: 2.5em;
      }

      .column.main-content {
        min-height: 0px;
        display: flex;
        flex-direction: column;
        padding: 0px;
        margin-top: 0.5em;
        margin-left: 0.75em;
      }

      .index-bar {
        display: flex;
        flex-direction: column;
        border-right: 3px solid rgb(237, 237, 237);
        background-color: whitesmoke;
        padding-right: 0px;
      }

      .index-bar-title {
        font-size: 1.25rem;
        text-transform: uppercase;
        margin-bottom: 1.0rem;
        word-break: break-word;
      }

      .index-bar-status {
        display: flex;
        flex-direction: row;
        margin-bottom: 0.5rem;
        padding-right: 0.75em;
      }

      .index-bar-menu {
        margin-top: 1.0rem;
      }

      #filter-label {
        margin-bottom: 0px;
      }

      .num-results {
        font-style: italic;
        font-weight: normal;
        line-height: 2.5;
      }

      .asc:after {
        content: "▼";
        font-size: 0.75em;
      }
      .desc:after {
        content: "▲";
        font-size: 0.75em;
      }

      @media screen and (min-width: 769px) {
        .main.columns {
          max-height: 100%;
          height: 100%;
        }
  
        .index-bar-menu {
          max-height: 100%;
          overflow-y: auto;
        }
      }
  
      @media screen and (max-width: 768px) {
        ${Pages.sidebarStyles()}
      }

      ${Pages.sidebarStyles(unsafeCSS`:host(.sidebar)`)}

      .mobile-lists {
        display: block !important;
      }

      :host(.sidebar) .columns.is-hidden-mobile, :host(.sidebar) .is-hidden-mobile {
        display: none !important;
      }

      :host(.sidebar) .mobile-header {
        display: flex !important;
      }

      :host(.sidebar) .columns {
        display: flex !important;
      }

      .scroller {
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        flex: auto;

        padding-bottom: 1.0em;
        min-height: 0px;
      }
      
      .current {
        /*background-color: rgb(207, 243, 255);*/
      }

      .page-header {
        display: flex;
        flex-flow: row wrap;
        width: 100%;
        min-height: fit-content;

        margin-bottom: 1.0em;
        border-bottom: 3px solid rgb(237, 237, 237);
      }

      .check-select {
        padding-right: 1.0em;
      }

      .search-bar {
        width: auto;
        display: flex;
        flex-direction: column;
      }
      .flex-auto {
        flex: auto;
      }
    `);
  }

  static sidebarStyles(prefix = css``) {
    return css`
    ${prefix} .main.columns {
      position: relative;
      max-height: 100%;
      height: 100%;
    }

    ${prefix} .index-bar-menu {
      max-height: 75px;
      overflow-y: auto;
      margin-top: 0.75em;
    }

    ${prefix} .column.main-content {
      position: relative;
      overflow-y: auto;

      width: 100%;
      min-height: 0px;
      height: 100%;
      padding: 0px;
      margin: 0px;
    }

    ${prefix} .mobile-header {
      margin: 0.5rem;
      margin-left: 1.0rem;
      align-items: center;
      display: flex;
      justify-content: space-between;
      flex-flow: row wrap;
      min-height: 24px;
      width: 100%;
    }

    ${prefix} .menu {
      font-size: 0.80rem;
    }`;
  }

  onSelectList(event) {
    event.preventDefault();
    this.currList = Number(event.currentTarget.getAttribute("data-list"));
  }

  onSelectListDrop(event) {
    event.preventDefault();
    this.currList = Number(event.currentTarget.value);
  }

  render() {
    const currList = this.currList;

    return html`
    <div class="search-bar notification is-marginless">
      <div class="field flex-auto">
        <div class="control has-icons-left ${this.loading ? 'is-loading' : ''}">
          <input type="text" class="input" @input="${this.onChangeQuery}" .value="${this.query}" type="text"
          placeholder="Search by Page URL, Title or Text">
          <span class="icon is-left"><fa-icon .svg="${fasSearch}"/></span>
        </div>
      </div>

      ${this.isSidebar && this.collInfo.lists.length ? html`
      <div class="is-hidden-tablet mobile-lists">
        <span class="is-size-7">Filter By List:</span>
        <div class="select is-small">
          <select id="sort-select" @change=${this.onSelectListDrop}>
          <option value="0" ?selected="${this.currList === 0}">All Pages</option>
          ${this.collInfo.lists.map(list => html`
            <option value="${list.id}" ?selected="${this.currList === list.id}">${list.title}</option>
          `)}
          </select>
        </div>
      </div>` : ``}

    </div>


      <div class="main columns">
        <div class="column index-bar is-one-fifth is-hidden-mobile">
          <div class="index-bar-title">${this.collInfo.title}</div>

          <span class="num-results">${this.formatResults()}</span>

          ${this.editable ? html`
          <div class="index-bar-actions">
            ${this.renderDownloadMenu()}
          </div>` : ``}

          ${this.collInfo.lists.length ? html`
          <p id="filter-label" class="menu-label">Filter By List:</p>
          <aside class="index-bar-menu menu">
            <ul class="menu-list">
              <li>
                <a href="#list-0" data-list="0" class="${currList === 0 ? 'is-active' : ''}"
                  @click=${this.onSelectList}><i>All Pages</i></a>
              </li>
              ${this.collInfo.lists.map(list => html`
                <li>
                  <a @click=${this.onSelectList} href="#list-${list.id}"
                  data-list="${list.id}" 
                  class="${currList === list.id ? 'is-active' : ''}">${list.title}</a>
                </li>`)}
            </ul>
          </aside>
          ` : ``}
        </div>
        <div class="column main-content">
          ${this.renderPages()}
        </div>

    </div>`;
  }

  renderDownloadMenu() {
    return html`
      <div class="dropdown ${this.menuActive ? 'is-active' : ''}">
        <div class="dropdown-trigger">
          <button @click="${this.onMenu}" class="button is-small" aria-haspopup="true" aria-controls="dropdown-menu">
            <span>Download</span>
            <span class="icon is-small">
              <fa-icon .svg="${fasAngleDown}"/>
            </span>
          </button>
        </div>
        <div class="dropdown-menu" id="dropdown-menu" role="menu">
          <div class="dropdown-content">
            <a @click="${(e) => this.onDownload(e, "wacz", true)}" class="dropdown-item">
              Download Selected as WACZ (Web Archive Collection)
            </a>
            <a @click="${(e) => this.onDownload(e, "warc", true)}" class="dropdown-item">
              Download Selected as WARC Only
            </a>
            <hr class="dropdown-divider">
            <a @click="${(e) => this.onDownload(e, "wacz", false)}" class="dropdown-item">
              Download All as WACZ (Web Archive Collection)
            </a>
            <a @click="${(e) => this.onDownload(e, "warc", false)}" class="dropdown-item">
              Download All as WARC Only
            </a>
          </div>
        </div>
      </div>`;
  }

  renderPageHeader() {
    return html`
    ${this.editable ? html`
    <div class="check-select">
      <label class="checkbox">
      <input @change=${this.onSelectAll} type="checkbox" .checked="${this.allSelected}">
      </label>
    </div>` : html``}

    <div class="header columns is-hidden-mobile">
      ${this.query ? html`
      <a @click="${this.onSort}" data-key="" class="column is-1 ${this.sortKey === "" ? (this.sortDesc ? "desc" : "asc") : ''}">Match</a>` : ``}

      <a @click="${this.onSort}" data-key="ts" class="column is-2 ${this.sortKey === "ts" ? (this.sortDesc ? "desc" : "asc") : ''}">Date</a>
      <a @click="${this.onSort}" data-key="title" class="column is-6 pagetitle ${this.sortKey === "title" ? (this.sortDesc ? "desc" : "asc") : ''}">Page Title</a>
    </div>

    

    <div class="is-hidden-tablet mobile-header">
      <div class="num-results">${this.formatResults()}</div>
      <wr-sorter id="pages"
      .defaultKey="${this.sortKey ? this.sortKey : (this.query ? '' : 'ts')}"
      .defaultDesc="${this.sortDesc !== null ? this.sortDesc : (this.query ? false : true)}"
      .sortKeys="${Pages.sortKeys}"
      .data="${this.filteredPages}"
      @sort-changed="${this.onSortChanged}"
      class="${this.filteredPages.length ? '' : 'is-hidden'}">
      </wr-sorter>
    </div>
    `;
  }

  isCurrPage(page) {
    if (this.isSidebar) {
      if (page.url === this.url) {
        let ts = page.timestamp;
        if (!ts && page.date) {
          ts = getTS(page.date);
        } else if (typeof(page.ts) === "string") {
          ts = getTS(page.ts);
        }
        return ts === this.ts;
      }
    }

    if (this.editable) {
      return this.selectedPages.has(p.id);
    }

    return false;
  }

  renderPages() {
    //const name = this.currList === 0 ? "All Pages" : this.collInfo.lists[this.currList - 1].title;
    return html`
      <div class="page-header has-text-weight-bold">
      ${this.renderPageHeader()}
      </div>
      <div class="scroller" @scroll="${this.onScroll}">
        ${this.sortedPages.length ? html`
          ${this.sortedPages.map((p, i) => {
            const isCurrPage = this.isCurrPage(p);

            return html`
          <div class="content ${isCurrPage ? 'current' : ''}">
            <wr-page-entry
            .index="${this.query || this.isSidebar ? i + 1 : 0}"
            .editable="${this.editable}"
            .selected="${this.selectedPages.has(p.id)}"
            .isCurrent="${isCurrPage}"
            .page="${p}"
            @sel-page="${this.onSelectToggle}"
            @delete-page="${this.onDeletePage}"
            replayPrefix="${this.collInfo.replayPrefix}"
            query="${this.query}"
            class="${this.isSidebar ? 'sidebar' : ''}"
            >
            </wr-page-entry>
          </div>` })}` : html`<p class="mobile-header">${this.getNoResultsMessage()}</p>`}
      </div>
    `;
  }

  onMenu(event) {
    event.stopPropagation();
    this.menuActive = !this.menuActive;

    if (this.menuActive) {
      document.addEventListener("click", () => {
        this.menuActive = false;
      }, {once: true});
    }
  }

  onSort(event) {
    event.preventDefault();

    const key = event.currentTarget.getAttribute("data-key") || "";
    if (key === this.sortKey) {
      this.sortDesc = !this.sortDesc;
    } else {
      this.sortDesc = false;
      this.sortKey = key;
    }
  }

  onSortChanged(event) {
    this.sortedPages = event.detail.sortedData;
    this.sortKey = event.detail.sortKey;
    this.sortDesc = event.detail.sortDesc;
  }

  onSelectToggle(event) {
    const {page, selected} = event.detail;
    if (selected) {
      this.selectedPages.add(page);
    } else {
      this.selectedPages.delete(page);
    }
    this.allSelected = (this.selectedPages.size === this.sortedPages.length);
    this.requestUpdate();
  }

  onSelectAll(event) {
    this.allSelected = event.currentTarget.checked;
    if (!this.allSelected) {
      this.selectedPages.clear();
    } else {
      //this.selectedPages = new Set();
      this.sortedPages.forEach(p => {
        this.selectedPages.add(p.id);
      });
    }
    //this.allSelected = (this.selectedPages.size === this.sortedPages.length);
    this.requestUpdate();
  }

  async onDownload(event, format, selected) {
    event.preventDefault();

    const params = new URLSearchParams();
    params.set("pages", selected ? Array.from(this.selectedPages.keys()).join(",") : "all");
    params.set("format", format);
    if (this.collInfo.filename) {
      params.set("filename", this.collInfo.filename);
    }

    window.location.href = `${this.collInfo.apiPrefix}/dl?` + params.toString();
  }

  async onDeletePage(event) {
    const page = event.currentTarget.page;
    const resp = await fetch(`${this.collInfo.apiPrefix}/page/${page.id}`, {method: 'DELETE'});
    const json = await resp.json();

    const inx = this.collInfo.pages.indexOf(page);
    if (inx < 0) {
      return;
    }

    //todo: full update?
    this.collInfo.pages.splice(inx, 1);
    //if (!this.query){
    //  this.filteredPages = [...this.collInfo.pages];
    //}

    this.updateTextSearch();
    this.requestUpdate();
  }

  formatResults() {
    if (this.sortedPages.length === 1) {
      return "1 Page Found";
    } else {
      return `${this.sortedPages.length} Pages Found`;
    }
  }

  getNoResultsMessage() {
    if (!this.collInfo || !this.collInfo.pages.length) {
      return html`No Pages defined this archive. Check out&nbsp;<a href="#view=resources">Page Resources</a>&nbsp;to search by URL.`;
    }

    if (this.updatingSearch) {
      return "Initializing Search..."
    }

    if (this.loading) {
      return "Searching...";
    }

    if (!this.query) {
      return "No Pages Found. Try changing the search query.";
    }

    return "No Pages Found";
  }

  onScroll(event) {
    const element = event.currentTarget;
    const diff = (element.scrollHeight - element.scrollTop) - element.clientHeight;
    if (diff < 40) {
      const sorter = this.renderRoot.querySelector("wr-sorter");
      if (sorter) {
        sorter.getMore();
      }
    }
  }
}


customElements.define("wr-page-view", Pages);

export { Pages };
