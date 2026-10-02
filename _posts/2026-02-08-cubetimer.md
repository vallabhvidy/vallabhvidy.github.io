---
layout: post
title: "CubeTimer: Building a GTK4 Solves Manager for GNOME"
description: "Developing a native GNOME desktop application for speedcubers using GTK4, LibAdwaita, and SQLite, reaching 2,900+ active users."
date: 2026-02-08
---

<p>Most speedcubing timers on Linux are either heavy web wrappers or outdated GTK2/3 utilities that don't fit modern desktop design languages. I wanted a fast, lightweight, and native application built specifically for the GNOME desktop environment.</p>

<p>The result is <strong>CubeTimer</strong>, a speedcubing practice and statistics suite that has grown to over <strong>2,900+ active users</strong> on Flathub.</p>

<h2>Key Features</h2>
<ul>
  <li><strong>WCA Compliant:</strong> Implements official World Cube Association regulations including 15-second inspection countdowns with 8-second and 12-second auditory alerts, plus random-state scrambles for 2x2 through 7x7 cubes, Pyraminx, Megaminx, and Square-1.</li>
  <li><strong>Statistics Engine:</strong> Computes rolling trimmed averages (Ao5, Ao12, Ao50, Ao100), best singles, mean solve times, and standard deviations in real time.</li>
  <li><strong>SQLite Local Persistence:</strong> All sessions, solve times, penalty flags (+2, DNF), and scramble seeds are persisted locally with zero cloud dependencies.</li>
</ul>

<h2>Adopting GTK4 &amp; LibAdwaita</h2>
<p>CubeTimer is built with GTK4 and LibAdwaita, ensuring proper integration into the modern Linux desktop:</p>
<ul>
  <li>Native support for system dark/light accent schemes.</li>
  <li>Responsive window layouts that scale cleanly from mobile Linux screens to ultrawide monitors.</li>
  <li>Flatpak sandboxing with strict file permissions and zero background telemetry.</li>
</ul>

<p>Available on <a href="https://flathub.org" target="_blank" rel="noreferrer">Flathub</a> and open source on <a href="https://github.com/vallabhvidy" target="_blank" rel="noreferrer">GitHub</a>.</p>
