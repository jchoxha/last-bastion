'use client';
/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Wide reference tables must be keyboard-scrollable. */

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Search, X } from 'lucide-react';
import { wikiChapters, type WikiBlock } from '@/lib/game-wiki.generated';

function Inline({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\[[^\]]+\]\(https:\/\/[^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g)
        .map((part, i) => {
          const link = /^\[([^\]]+)\]\((https:\/\/[^)]+)\)$/.exec(part);
          if (link)
            return (
              <a key={i} href={link[2]} target="_blank" rel="noreferrer">
                {link[1]}
              </a>
            );
          if (part.startsWith('`'))
            return <code key={i}>{part.slice(1, -1)}</code>;
          if (part.startsWith('**'))
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          return part;
        })}
    </>
  );
}

function Block({ block }: { block: WikiBlock }) {
  if (block.type === 'paragraph')
    return (
      <p
        className={
          block.text.startsWith('Sources:') ? 'wiki-sources' : undefined
        }
      >
        <Inline text={block.text} />
      </p>
    );
  if (block.type === 'list')
    return (
      <ul>
        {block.items.map((text, i) => (
          <li key={i}>
            <Inline text={text} />
          </li>
        ))}
      </ul>
    );
  return (
    // A scrollable table needs a keyboard focus target when wider than the screen.
    <section
      className="wiki-table-scroll"
      tabIndex={0}
      aria-label="Reference table, scroll horizontally on small screens"
    >
      <table>
        <thead>
          <tr>
            {block.headers.map((text, i) => (
              <th key={i} scope="col">
                <Inline text={text} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i}>
              {row.map((text, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    <Inline text={text} />
                  </th>
                ) : (
                  <td key={j}>
                    <Inline text={text} />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const blockText = (block: WikiBlock) =>
  block.type === 'paragraph'
    ? block.text
    : block.type === 'list'
      ? block.items.join(' ')
      : [...block.headers, ...block.rows.flat()].join(' ');
const searchIndex = wikiChapters.flatMap((chapter) =>
  chapter.sections.map((section) => ({
    chapter,
    section,
    text: [
      chapter.title,
      chapter.intro,
      section.title,
      ...section.blocks.map(blockText),
    ]
      .join(' ')
      .toLowerCase(),
  })),
);
const readLocation = () => {
  const [, chapter, section] = window.location.hash.slice(1).split('/');
  return {
    chapter: wikiChapters.some((c) => c.id === chapter)
      ? chapter
      : wikiChapters[0].id,
    section: section || '',
  };
};

export default function GameWiki({ onClose }: { onClose: () => void }) {
  const [location, setLocation] = useState({
    chapter: wikiChapters[0].id,
    section: '',
  });
  const [query, setQuery] = useState('');
  const article = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const chapter =
    wikiChapters.find((c) => c.id === location.chapter) || wikiChapters[0];
  const index = wikiChapters.indexOf(chapter);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length
    ? searchIndex.filter((entry) =>
        terms.every((term) => entry.text.includes(term)),
      )
    : [];

  useEffect(() => {
    const update = () => {
      setLocation(readLocation());
      setQuery('');
    };
    update();
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = location.section
        ? document.getElementById(
            'wiki-' + location.chapter + '-' + location.section,
          )
        : null;
      if (target) {
        target.scrollIntoView({ block: 'start' });
        target.focus({ preventScroll: true });
      } else {
        article.current?.scrollTo(0, 0);
        if (window.matchMedia('(max-width: 620px)').matches)
          heading.current?.scrollIntoView({ block: 'start' });
        heading.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [location]);

  const navigate = (id: string, section = '') => {
    setQuery('');
    setLocation({ chapter: id, section });
    window.location.assign('#wiki/' + id + (section ? '/' + section : ''));
  };

  return (
    <main className="wiki-page">
      <a
        className="wiki-skip"
        href="#wiki-reading"
        onClick={(e) => {
          e.preventDefault();
          heading.current?.focus();
        }}
      >
        Skip to article
      </a>
      <header className="wiki-topbar">
        <button onClick={onClose} className="wiki-back">
          <ArrowLeft size={17} /> Main menu
        </button>
        <span>
          <BookOpen size={17} /> LAST BASTION <b>FIELD GUIDE</b>
        </span>
        <span className="wiki-edition">Current mechanics · September 2026</span>
      </header>
      <div className="wiki-layout">
        <aside className="wiki-sidebar">
          <div className="wiki-brand">
            <span className="menu-kicker">KNOW YOUR FRONTIER</span>
            <h1>
              The Bastion
              <br />
              <em>Codex.</em>
            </h1>
            <p>
              A player’s handbook.
              <br />A reference for what comes next.
            </p>
          </div>
          <label className="wiki-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Search the wiki"
              placeholder="Search mechanics, costs, controls…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery('')}>
                <X size={15} />
              </button>
            )}
          </label>
          <nav aria-label="Wiki chapters">
            {['Play guide', 'Design reference'].map((group) => (
              <div key={group}>
                <h2>{group}</h2>
                {wikiChapters
                  .filter((c) => c.group === group)
                  .map((c) => (
                    <a
                      key={c.id}
                      href={'#wiki/' + c.id}
                      aria-current={
                        !terms.length && chapter.id === c.id
                          ? 'page'
                          : undefined
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(c.id);
                      }}
                    >
                      <span>
                        {String(wikiChapters.indexOf(c) + 1).padStart(2, '0')}
                      </span>
                      {c.title}
                      {chapter.id === c.id && !terms.length && (
                        <ArrowRight size={14} />
                      )}
                    </a>
                  ))}
              </div>
            ))}
          </nav>
          <p className="wiki-sidebar-note">
            Available offline in the standalone game.
            <br />
            Source links open GitHub.
          </p>
        </aside>
        <article
          className="wiki-reading"
          ref={article}
          aria-label="Wiki article"
          id="wiki-reading"
        >
          {terms.length ? (
            <div className="wiki-article-inner">
              <span className="menu-kicker">SEARCH THE FIELD GUIDE</span>
              <h2 ref={heading} tabIndex={-1}>
                Search results
              </h2>
              <output className="wiki-lede" aria-live="polite">
                {results.length} {results.length === 1 ? 'section' : 'sections'}{' '}
                matching “{query.trim()}”
              </output>
              <div className="wiki-results">
                {results.map(({ chapter: c, section }) => (
                  <button
                    key={c.id + section.id}
                    onClick={() => navigate(c.id, section.id)}
                  >
                    <small>
                      {c.group} / {c.title}
                    </small>
                    <strong>
                      {section.title}
                      <ArrowRight size={18} />
                    </strong>
                    <span>
                      {section.blocks.map(blockText).join(' ').slice(0, 190)}…
                    </span>
                  </button>
                ))}
              </div>
              {!results.length && (
                <div className="wiki-empty">
                  <BookOpen size={30} />
                  <h3>No matching sections</h3>
                  <p>
                    Try a broader term such as “stairs”, “ranger”, “save”, or
                    “ore”.
                  </p>
                  <button onClick={() => setQuery('')}>Clear search</button>
                </div>
              )}
            </div>
          ) : (
            <div className="wiki-article-inner">
              <div className="wiki-breadcrumb">
                {chapter.group}
                <span>/</span>Chapter {String(index + 1).padStart(2, '0')}
              </div>
              <h2 ref={heading} tabIndex={-1}>
                {chapter.title}
              </h2>
              <p className="wiki-lede">{chapter.intro}</p>
              <nav className="wiki-toc" aria-label="In this chapter">
                <span>IN THIS CHAPTER</span>
                {chapter.sections.map((section) => (
                  <a
                    key={section.id}
                    href={'#wiki/' + chapter.id + '/' + section.id}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(chapter.id, section.id);
                    }}
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
              {chapter.sections.map((section) => (
                <section key={section.id}>
                  <h3
                    tabIndex={-1}
                    id={'wiki-' + chapter.id + '-' + section.id}
                  >
                    {section.title}
                    <a
                      href={'#wiki/' + chapter.id + '/' + section.id}
                      aria-label={'Link to ' + section.title}
                    >
                      #
                    </a>
                  </h3>
                  {section.blocks.map((block, i) => (
                    <Block key={i} block={block} />
                  ))}
                </section>
              ))}
              <footer className="wiki-pagination">
                {index > 0 ? (
                  <button onClick={() => navigate(wikiChapters[index - 1].id)}>
                    <small>PREVIOUS CHAPTER</small>
                    <span>
                      <ArrowLeft size={16} />
                      {wikiChapters[index - 1].title}
                    </span>
                  </button>
                ) : (
                  <span />
                )}
                {index < wikiChapters.length - 1 && (
                  <button onClick={() => navigate(wikiChapters[index + 1].id)}>
                    <small>NEXT CHAPTER</small>
                    <span>
                      {wikiChapters[index + 1].title}
                      <ArrowRight size={16} />
                    </span>
                  </button>
                )}
              </footer>
            </div>
          )}
        </article>
      </div>
    </main>
  );
}
