---
title: Improve Token Performance of Git Tools
date: 2026-03-29
status: resolved
---
We recently had a `git show` that was 122MB. It was true, but that blew token counts. Since we have a custom tool, we should optimize it for token performance. 
