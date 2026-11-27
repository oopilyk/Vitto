# Translating Vitto

Vitto is written in English and shown in English, Spanish (`es`) and Simplified
Chinese (`zh-Hans`). Every string a person can read, or hear from VoiceOver, is
written in English where it is used, inside one of the functions below. The
English is the catalog key: `es.json` and `zh-Hans.json` map it to the
translation, and a string with no translation yet shows in English.

The language is the phone's (on iOS, Settings > Vitto > Language can override
it). It is decided once, in `mobile/src/i18n/boot.ts`, before any other module
loads, and never changes while the app runs, so a string can be translated
anywhere, a table built at module level included.

In English every function returns exactly the English it was given. The tests
run in English, so wrapping a string must leave every existing test passing
unchanged.

## The functions

Import them from `'../i18n'` (adjust the path) in `mobile/src`, from
`'./src/i18n'` in `mobile/App.tsx`, and from the `i18n` folder
(`'../i18n'`) inside `packages/core/src`. `tRich` exists only in mobile.

| Call | For |
|---|---|
| `t('Log meal')` | a plain string |
| `t('{count} of {total} owned', { count, total })` | a string with values in it |
| `tn(count, '{count} coin', '{count} coins')` | a counted string; `{count}` is filled in for you |
| `tx('one set of an exercise', 'Set')` | an English word that means two things; the first argument tells the translator which |
| `tRich('Free, then {price}', { price: <Text style={bold}>{price}</Text> })` | a sentence with a styled or tappable part inside it |
| `msg('Bench Press')` | marks a stored value for translation without translating it (see "Stored values") |
| `formatLocale()` | the locale argument for `toLocaleDateString`, `toLocaleString` and `Intl.*` |

The string argument must be a plain literal written in the call (single quotes,
double quotes or a backtick string with no `${}`), or the extraction script
cannot see it.

## Rules

**Whole sentences.** A translation reorders words, so never join translated
pieces or English fragments:

```tsx
// No
`Last cared for ${days === 0 ? 'today' : 'yesterday'}`
t('Last cared for') + ' ' + when
// Yes
days === 0 ? t('Last cared for today') : days === 1 ? t('Last cared for yesterday') : t('Last cared for {days} days ago', { days })
```

A value may go in as a placeholder when it is a name, a number, a price, a
date, or a term that stands alone (`t('{pet} is hungry', { pet: pet.name })`).

**Template strings become placeholders.** `` `${coins} coins` `` becomes
`tn(coins, '{count} coin', '{count} coins')`; `` `Visiting ${name}` `` becomes
`t('Visiting {name}', { name })`. Name placeholders for what they hold.

**Plurals use `tn`.** Replace `` `${n} session${n > 1 ? 's' : ''}` `` with
`tn(n, '{count} session', '{count} sessions')`. A count that is always large
(steps, calories) can stay a plain `t`.

**JSX text.** `<Text>Log meal</Text>` becomes `<Text>{t('Log meal')}</Text>`.
Text split across nested `<Text>` elements for styling is one sentence: use
`tRich`.

**Also translate:** `accessibilityLabel`, `accessibilityHint`, `placeholder`,
`title`/`label`/`hint`/`detail` props, alert and confirm text, toasts, error
messages that reach the screen (`throw new Error('…')` shown to the person,
`errorMessage(cause, '…')` fallbacks), and notification titles and bodies.

**Do not translate:**
- `testID`s, keys, route names, enum values, style values, asset names, URLs, regexes, log and `console` text, comments
- anything stored, sent to the server, compared (`===`, `includes`, `switch`), or used as a lookup key
- errors only a developer sees (`'ANTHROPIC_API_KEY is not configured.'`)
- names of the app and its things: `Vitto`, `Vitto Plus`, `Apple Health`, a pet's own name, a username
- unit symbols: `kcal`, `g`, `kg`, `lb`, `km`, `mi`, `%`. Unit words are translated: `steps`, `reps`, `sets`, `min`
- screens only the developer sees (`CompanionDebugScreen`, dev-account notes, test-mode notes)
- anything under `packages/core/src/companion`: that folder is copied to the server as it is, and must not import from outside itself

**Stored values.** Some English strings are data: an exercise's name is saved
with the workout and looked up by that name; a label may be written into a
saved record or sent to a friend. Translating one where it is defined would
break the lookup and mix languages in the database. Keep the stored value
English, mark it with `msg('Bench Press')` where it is defined, and translate
only where it is drawn: `t(exercise.name)`. `t` on a value that has no
translation returns it unchanged, so text a person typed is safe to pass
through. If you cannot tell whether a string is stored or compared, search for
its uses before wrapping it.

**Text built at module level is fine**, with one exception: do not call `t`
at module level in a file that tests import and then switch language. There
are none today.

**A local named `t`.** Some files already have a variable or parameter called
`t` (an interpolation amount, a time). Rename that local (to `amount`, `time`,
…) rather than aliasing the import: the extraction script looks for calls
named `t`, `tx`, `tn`, `msg`, `tRich` and `tParts`.

**Dates and numbers.** Pass `formatLocale()` wherever the code passes a
locale: `value.toLocaleString('en-US')` and `date.toLocaleDateString([], …)`
and `toLocaleDateString(undefined, …)` all become `…(formatLocale(), …)`.
Replace hand-written month and weekday names with `toLocaleDateString` or
`Intl.DateTimeFormat`. Never build a date from translated pieces.

**Case.** Keep the English exactly as written, capitals included (`'TODAY'`
stays `'TODAY'`): styles that uppercase text keep working, and the
translator decides the case in each language.

**Ambiguity.** Use `tx` when the same English is used for two different
things in the app (`Set` the noun and `Set` the verb, `Log` the button and
`Log` the list, `Rest`, `Close`, `Light`, `Free`). One English string that
always means the same thing is a plain `t`, even if it appears in ten places.

**Keep the diff small.** Change only what makes a string translatable. Do
not rename, reformat, reorder or restyle anything else, and do not edit
`es.json` or `zh-Hans.json` while wrapping: translation is a separate step.

## Layout

Spanish runs about a third longer than English; Chinese is shorter in
characters but each is wider, has no spaces, and the pixel and rounded faces
have no Chinese glyphs (the system face stands in). Anything sized for the
English words is at risk: a fixed `width` or `height` around text,
`numberOfLines={1}` in a narrow column, a row of pills, a tab bar. Prefer
`FitText` (mobile/src/components/FitText.tsx), `minHeight` over `height`,
and wrapping over truncation. Width estimated from a character count must
count a Chinese character as two.

## Checking

```
node scripts/i18n.mjs check          # how many strings, and what each language is missing
node scripts/i18n.mjs check --list   # the same, listed
node scripts/i18n.mjs dynamic        # calls whose string is not written in place
```

To see the app in another language: on the web build, add `?lang=es` or
`?lang=zh-Hans` to the address; on the iOS simulator,
`xcrun simctl spawn booted defaults write com.getvitto.app AppleLanguages -array es`
and relaunch (`-array zh-Hans` for Chinese, `defaults delete … AppleLanguages`
to go back).

Translators: see GLOSSARY.md for tone and the fixed terms.
