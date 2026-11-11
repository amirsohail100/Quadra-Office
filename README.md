# Quadra Office

Quadra Office is an educational office suite built as part of the **Quadra** brand. It brings Word-style, Excel-style, PowerPoint-style and OneNote-style applications together in one home page. The project is for learning how a multi-app web product is structured, and how the same code can be packaged as a desktop application using Electron.

> Purpose: education. This project is a learning exercise and is not a replacement for Microsoft Office. The layout of the home page is inspired by the public Microsoft 365 website for study purposes only.

## Features

- Single home page with a dark top navigation and hero section
- Four app tiles (Word, Excel, PowerPoint, OneNote) at the bottom of the home page
- Click any app to open it inside the same window, with a toolbar and a "Home" button to go back
- Each app stays loaded while you switch between apps, so unsaved work is not lost
- URL hash routing: `#word`, `#excel`, `#powerpoint`, `#onenote` open the apps directly
- "Open in new tab" option for every app
- Works in a browser, and can be packaged as a Windows portable `.exe` with Electron

## Project structure
