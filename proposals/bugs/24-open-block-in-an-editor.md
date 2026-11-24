# An unfinished block never ends in an editor

The editor's parse of this text runs until the memory is full:

```rx
action a() {
```

**On upstream (e650b85).** `rxc serve`, and the language server: no answer; memory grows until the process, or the machine, dies. `rxc check` is right. The same for any block of statements that is not closed at the end of the file (`effect () {`, `onClick={() => {`).

**Spec.** 11 CP-8e: an editor's parse recovers.

**Cause.** Recovering, a missing expression is an empty one. At the end of the file a block reads one empty statement after another, and moves no further.

**Fix in this branch.** A statement that reads nothing is an error, and the block ends.

**Test.** A unit test in `parse.rs`. It was found by cutting every program short. (This one is not run by `check.mjs`: on upstream it takes the memory of the machine.)
