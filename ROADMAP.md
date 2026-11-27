# Roadmap

The MVP covers manual linked-list work end to end. The items below build toward working through a broad range of LeetCode problems, still without automatic execution.

## Structures

- Binary trees and BSTs with a tree layout helper (layout only, never semantic)
- Graph nodes with adjacency lists and edge weights
- Heaps or priority queues shown as both an array and a tree view of the same slots
- Hash map buckets and collision chains
- Strings as character arrays with index markers
- Typed slot constraints, for example `int[]` accepting only numbers, as optional warnings

## Interaction

- Reconnect an existing reference edge by dragging its end
- Touch and pen support (pinch zoom, long-press context menu)
- Keyboard-only editing of fields and references
- Better automatic edge routing for dense diagrams
- Multiple named canvases per project, such as "input" and "scratch"

## Execution and history

- Read-only **playback**: step through the recorded timeline at a chosen speed. It replays what the user did and never generates steps.
- Visual diff between two timeline points or between branches
- Branch naming, merging notes and a branch tree view
- Recursion helpers: a frame tree view and an explicit "return value to caller slot" action that the user triggers
- Condition contexts with else-if chains and switch

## Learning and challenges

- More LeetCode problems:
  - 21 Merge Two Sorted Lists
  - 141 Linked List Cycle
  - 876 Middle of the Linked List
  - 104 Maximum Depth of Binary Tree
  - 200 Number of Islands
  - 704 Binary Search
- Starter input builders per challenge, such as "build input from `[1,2,3]`". The user still creates the structure, or explicitly accepts a generated input.
- Complexity comparison: compare operation counts between two attempts or branches
- Optional hints that point to concepts, not to steps

## Platform

- Project thumbnails and search in the projects dialog
- Schema migrations for `schemaVersion` > 1
- Shareable read-only export, such as a static HTML snapshot
- Accessibility pass (screen-reader descriptions of memory state, focus order)
