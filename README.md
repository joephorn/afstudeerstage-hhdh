# Generative Typography Tool

A creative coding tool that generates dynamic, motion-based typography systems for Albion.

This project was developed as part of a graduation internship at HeyHeydeHaas.
The goal is to explore how generative systems can support designers in creating dynamic identities.

[demo](https://joephorn.github.io/afstudeerstage-hhdh/)

## Features
- Generate typographic compositions from custom letter paths
- Parameters controlled via UI elements
- Export to PDF / SVG / MP4 / PNG
- Real-time preview
- Keyframe system
- Lock parameters

## Built with
- JavaScript
- p5.js

## Getting started
```bash
git clone https://github.com/joephorn/afstudeerstage-hhdh
npx serve .
```
Both the `npx serve .` command and the *Live Server* plugin can be used to run a demo locally.

## Usage
![Screen Recording 2026-01-08 at 16 14 45](https://github.com/user-attachments/assets/58adb670-2d78-4351-954c-ae2261380d6a)
- Use the UI elements to manipulate the logo.
- Shortcuts can be used to speed up the process:

`<` (arrow-left) Previous keyframe

`>` (arrow-right) Next keyframe

`+` Add keyframe after current

`-` Remove current keyframe

`Space` Pause/play scene

`R` Randomize settings

`S` Screenshot and download current canvas

- Parameters can be locked by clicking on the name label. By doing this, the corrosponding value cannot be changed by interface or the randomize function.
- You can save the scene (the combination of keyframes) by clicking 'Save scene'. This saves a .json file to your machine, which can later be loaded back in via 'Load scene'.

## Credits
Developed by Joep Horn  
In collaboration with HeyHeydeHaas
