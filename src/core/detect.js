// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { walk, findFirst } from '../util/walk.js';
import { readJson } from './json.js';
import { readMarker } from './marker.js';

const MAX_DEPTH = 4;

const WEB_DEPS = 'next react react-dom vue svelte @sveltejs/kit vite @vitejs/plugin-react @vitejs/plugin-vue astro nuxt @angular/core solid-js'.split(' ');
const BACKEND_DEPS = '@nestjs/core express fastify koa @hapi/hapi prisma @prisma/client typeorm drizzle-orm mongoose'.split(' ');
const MOBILE_DEPS = 'react-native expo @react-native-community/cli @expo/cli'.split(' ');
const WEB_FILES = ['next.config.*', 'vite.config.*', 'astro.config.*', 'svelte.config.*', 'nuxt.config.*', 'angular.json'];
const MOBILE_FILES = ['pubspec.yaml', 'metro.config.js', 'Package.swift', '*.xcodeproj'];
const DEVOPS_FILES = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'ansible.cfg', 'Chart.yaml', '*.tf'];
const PY_LIBS = ['pandas', 'numpy', 'torch', 'tensorflow', 'scikit-learn', 'sklearn', 'pyspark', 'transformers'];
const PY_MANIFESTS = new Set(['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py']);

/**
 * @param {string} proj
 * @returns {Array<{ profile: string, signal: string }>}
 */
export function collectSignals(proj) {
  /** @type {Array<{ profile: string, signal: string }>} */
  const sigs = [];
  const emit = (profile, signal) => sigs.push({ profile, signal });

  const deps = new Set();
  for (const f of walk(proj, { maxDepth: MAX_DEPTH })) {
    if (path.basename(f) === 'package.json') {
      const pkg = readJson(f, {}) ?? {};
      for (const k of Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) })) {
        deps.add(k);
      }
    }
  }
  for (const d of WEB_DEPS) {
    if (deps.has(d)) { emit('web', `dep:${d}`); }
  }
  for (const d of BACKEND_DEPS) {
    if (deps.has(d)) { emit('backend', `dep:${d}`); }
  }
  for (const d of MOBILE_DEPS) {
    if (deps.has(d)) { emit('mobile', `dep:${d}`); }
  }

  for (const g of WEB_FILES) {
    if (findFirst(proj, g, MAX_DEPTH)) { emit('web', `file:${g}`); }
  }
  if (findFirst(proj, 'nest-cli.json', MAX_DEPTH)) { emit('backend', 'file:nest-cli.json'); }
  for (const g of MOBILE_FILES) {
    if (findFirst(proj, g, MAX_DEPTH)) { emit('mobile', `file:${g}`); }
  }
  for (const g of DEVOPS_FILES) {
    if (findFirst(proj, g, MAX_DEPTH)) { emit('devops', `file:${g}`); }
  }
  if (findFirst(proj, '*.ipynb', MAX_DEPTH)) { emit('data', 'file:*.ipynb'); }

  for (const f of walk(proj, { maxDepth: MAX_DEPTH })) {
    if (PY_MANIFESTS.has(path.basename(f))) {
      let text = '';
      try { text = fs.readFileSync(f, 'utf8'); } catch { text = ''; }
      const lower = text.toLowerCase();
      for (const lib of PY_LIBS) {
        if (new RegExp(`\\b${lib}\\b`).test(lower)) { emit('data', `py:${lib}`); }
      }
    }
  }
  return sigs;
}

/**
 * @param {string} proj
 */
export function detect(proj) {
  const sigs = collectSignals(proj);
  // dedup identical (profile|signal) pairs, like `sort -u`
  const uniq = new Map();
  for (const { profile, signal } of sigs) {
    uniq.set(`${profile}|${signal}`, { profile, signal });
  }
  /** @type {Map<string, Set<string>>} */
  const byProfile = new Map();
  for (const { profile, signal } of uniq.values()) {
    if (!byProfile.has(profile)) { byProfile.set(profile, new Set()); }
    byProfile.get(profile).add(signal);
  }
  const candidates = [...byProfile.entries()]
    .map(([profile, set]) => ({ profile, score: set.size, signals: [...set] }))
    .sort((a, b) => b.score - a.score);

  const maxScore = candidates.length ? candidates[0].score : 0;
  const recommended = maxScore === 0 ? [] : candidates.filter((c) => c.score === maxScore).map((c) => c.profile);

  const marker = readMarker(proj);
  const applied = marker?.profiles ?? [];
  return { recommended, candidates, applied };
}
