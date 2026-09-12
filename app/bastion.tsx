'use client';
/* eslint-disable jsx-a11y/no-autofocus -- Focus the seed field only after the user opens the new-world dialog. */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Mountain, Play, FolderOpen, Shield, BookOpen } from 'lucide-react';
import GameWiki from './bastion/game-wiki';
import CreatureForge from './bastion/creature-forge';
import {
  makeCreature,
  parseCreature,
  type Creature,
} from '@/lib/creatures/core';
import { createCreatureActor } from '@/lib/creatures/actor';
import { generateWorld, generateWorldSteps, type Settings } from '@/lib/world';
import { bastionSource } from '@/lib/bastion-source';
import { parseSave, SAVE_KEY, type SaveGame } from '@/lib/save-game';
const DEFAULT: Settings = {
  seed: '',
  size: 64,
  hilliness: 0.15,
  trees: 0.22,
  scale: 2,
  dynamic: true,
  terrainMode: 'plateaus',
};
type Session = { id: number; settings: Settings; saved: SaveGame | null };
type GameWindow = Window & {
  bastion?: {
    pause: (paused: boolean) => void;
    save: () => boolean;
    spawnForgedCreature?: (creature: Creature) => string;
  };
};
export default function Bastion() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu'),
    [settings, setSettings] = useState<Settings>(DEFAULT),
    [saved, setSaved] = useState<SaveGame | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [started, setStarted] = useState(false),
    [notice, setNotice] = useState(''),
    [setup, setSetup] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const forgeButton = useRef<HTMLButtonElement>(null);
  const wikiButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const sync = () => {
      const open = window.location.hash.startsWith('#wiki/');
      const forge = window.location.hash === '#forge';
      setWikiOpen(open);
      setForgeOpen(forge);
      if (open || forge) {
        (iframe.current?.contentWindow as GameWindow | null)?.bastion?.pause(
          true,
        );
        setScreen('menu');
      }
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const openWiki = () => {
    (iframe.current?.contentWindow as GameWindow | null)?.bastion?.pause(true);
    setScreen('menu');
    setWikiOpen(true);
    window.location.assign('#wiki/start-here');
  };
  const closeWiki = () => {
    setWikiOpen(false);
    window.location.assign('#');
    requestAnimationFrame(() => wikiButton.current?.focus());
  };
  const openForge = () => {
    (iframe.current?.contentWindow as GameWindow | null)?.bastion?.pause(true);
    setScreen('menu');
    setForgeOpen(true);
    setWikiOpen(false);
    window.location.assign('#forge');
  };
  const closeForge = () => {
    setForgeOpen(false);
    window.location.assign('#');
    requestAnimationFrame(() => forgeButton.current?.focus());
  };
  const notify = (message: string) => {
    setNotice(message);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setNotice(''), 6500);
  };
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      // Browser storage is loaded after hydration; it is unavailable on the server.
      // eslint-disable-next-line react/react-compiler
      if (raw) setSaved(parseSave(raw));
    } catch {
      notify(
        'The saved game could not be read. You can still start a new run.',
      );
    }
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);
  const menu = () => {
    (iframe.current?.contentWindow as GameWindow | null)?.bastion?.pause(true);
    setScreen('menu');
  };
  const start = (load: SaveGame | null) => {
    if (started)
      (iframe.current?.contentWindow as GameWindow | null)?.bastion?.save();
    const config = load
      ? load.config
      : {
          ...DEFAULT,
          seed:
            settings.seed.trim() ||
            Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) =>
              n.toString(36),
            ).join('-'),
        };
    setSetup(false);
    setSession({ id: Date.now(), settings: config, saved: load });
    setStarted(false);
    setScreen('game');
  };
  useEffect(() => {
    if (!session) return;
    const bridge = {
      THREE,
      creatures: { makeCreature, parseCreature, createCreatureActor },
      generateWorld,
      generateWorldSteps,
      settings: session.settings,
      saved: session.saved,
      notify,
      started: () => setStarted(true),
      menu,
      save: (value: SaveGame, silent = false) => {
        try {
          const raw = JSON.stringify(value);
          localStorage.setItem(SAVE_KEY, raw);
          setSaved(value);
          if (!silent) notify('Game saved on this device.');
          return true;
        } catch {
          notify(
            'Saving failed. Browser storage may be full or unavailable; keep this run open.',
          );
          return false;
        }
      },
    };
    (window as Window & { __lastBastionBridge?: unknown }).__lastBastionBridge =
      bridge;
    if (iframe.current) iframe.current.srcdoc = bastionSource;
    return () => {
      delete (window as Window & { __lastBastionBridge?: unknown })
        .__lastBastionBridge;
    };
  }, [session]);
  const resume = () => {
    setScreen('game');
    (iframe.current?.contentWindow as GameWindow | null)?.bastion?.pause(false);
    iframe.current?.focus();
  };
  const exportSave = () => {
    if (!saved) return;
    const blob = new Blob([JSON.stringify(saved)], {
        type: 'application/json',
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'last-bastion-save.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importSave = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 12000000) throw new Error('Save file is too large.');
      const value = parseSave(await file.text());
      setSaved(value);
      notify('Save imported. Choose Load saved game to continue.');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not import this save.',
      );
    }
  };
  return (
    <div className="bastion-shell">
      {wikiOpen && <GameWiki onClose={closeWiki} />}
      {forgeOpen && (
        <CreatureForge
          onClose={closeForge}
          canSpawn={started && !!session}
          onSpawn={(creature) => {
            const game = (iframe.current?.contentWindow as GameWindow | null)
              ?.bastion;
            if (!game?.spawnForgedCreature)
              return 'Start a game and select a class before spawning a creature.';
            return game.spawnForgedCreature(creature);
          }}
        />
      )}
      {session && (
        <iframe
          key={session.id}
          ref={iframe}
          title="Last Bastion game"
          className={`game-frame ${screen === 'game' ? '' : 'game-paused'}`}
          allow="fullscreen; pointer-lock"
        />
      )}
      {screen === 'menu' && !wikiOpen && !forgeOpen && (
        <>
          <div className="menu-backdrop wilderness-backdrop">
            <div className="distant-ridge" />
            <div className="near-ridge" />
          </div>
          <div className="main-menu">
            <div className="menu-story">
              <span className="menu-kicker">
                <Shield size={17} /> A LIVING FRONTIER ROGUELIKE
              </span>
              <h1>
                Last
                <br />
                <em>Bastion.</em>
              </h1>
              <p>
                A gate. A handful of settlers.
                <br />A wilderness worth discovering.
              </p>
              <div className="menu-rule" />
              <span className="menu-footnote">
                EXPLORE. SETTLE. TRAIN. SURVIVE.
              </span>
            </div>
            <nav className="menu-actions" aria-label="Main menu">
              <span className="menu-kicker">YOUR NEXT FRONTIER</span>
              {session && (
                <button className="menu-choice resume" onClick={resume}>
                  <Play />
                  <span>
                    {started ? 'Resume game' : 'Continue setup'}
                    <small>Return to your settlement and exploration</small>
                  </span>
                  <b>↗</b>
                </button>
              )}
              <button className="menu-choice" onClick={() => setSetup(true)}>
                <Shield />
                <span>
                  New game<small>Choose Knight, Ranger, or Pyromancer</small>
                </span>
                <b>↗</b>
              </button>
              <button
                className="menu-choice"
                disabled={!saved}
                onClick={() => saved && start(saved)}
              >
                <FolderOpen />
                <span>
                  Load saved game
                  <small>
                    {saved
                      ? `${saved.classId} · wave ${saved.state.wave} · ${new Date(saved.savedAt).toLocaleString()}`
                      : 'No saved game on this device yet'}
                  </small>
                </span>
                <b>↗</b>
              </button>
              <button
                ref={wikiButton}
                className="menu-choice"
                onClick={openWiki}
              >
                <BookOpen />
                <span>
                  Game wiki
                  <small>Mechanics, building costs & design reference</small>
                </span>
                <b>↗</b>
              </button>
              <button
                ref={forgeButton}
                className="menu-choice"
                onClick={openForge}
              >
                <Shield />
                <span>
                  Creature forge
                  <small>Create, preview & test Chimera creatures</small>
                </span>
                <b>↗</b>
              </button>
              <div className="menu-settings">
                <Mountain size={17} />
                <p>
                  Endless wilderness
                  <br />
                  <strong>
                    2× terrain · plateaus & ramps · living settlements
                  </strong>
                  <small>
                    Every new world has a random seed, unless you enter your
                    own.
                  </small>
                </p>
              </div>
              <div className="save-files">
                <button disabled={!saved} onClick={exportSave}>
                  Export save
                </button>
                <label>
                  Import save
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      void importSave(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <p className="save-note">
                Save anytime in-game. Autosaves every 30 seconds.
                <br />
                Saves stay in this browser on this device.
              </p>
            </nav>
          </div>
        </>
      )}
      {setup && (
        <div className="world-setup">
          <section>
            <span className="menu-kicker">A NEW FRONTIER</span>
            <h2>Create a new world</h2>
            <label>
              World seed <small>Optional</small>
              <input
                autoFocus
                maxLength={80}
                placeholder="Leave blank for a random world"
                value={settings.seed}
                onChange={(e) =>
                  setSettings({ ...settings, seed: e.target.value })
                }
              />
            </label>
            <p>
              Raised plateaus, connecting ramps, forests and settlements
              generate as you explore. Every new world uses 2× terrain scale
              with no chosen world boundary.
            </p>
            <p>
              You begin at a warded portal with a home, defenses and settlers.
              Choose your class next.
            </p>
            <div className="save-files">
              <button onClick={() => start(null)}>Continue to character</button>
              <button onClick={() => setSetup(false)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
      {notice && (
        <output className="app-notice" aria-live="polite">
          {notice}
        </output>
      )}
    </div>
  );
}
