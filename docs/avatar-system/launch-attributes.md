# Modular avatar launch attribute matrix

Status: proposed for product, illustrator, AAC-user, and representation review.

This matrix is the baseline for the first modular art kit. Reviewers may reject
or rename an option before illustration begins. Engineering must not silently
add an option that has no approved artwork.

## Principles

1. A character identity describes the person and their usual presentation.
2. A symbol describes what that person is doing in one communication image.
3. Gender is not a required field. Presentation emerges from the selected face,
   hair, facial hair, body set, clothes, and accessories.
4. Body choices use neutral names. The interface must not label them as weight.
5. Accessibility equipment is part of representation, not decoration.
6. An unsupported combination is disabled with an explanation. The renderer
   never substitutes another identity or removes equipment silently.
7. The UI only exposes parts present in the approved manifest.

## Character identity

| Slot | Proposed launch choices | Notes |
| --- | --- | --- |
| Starting character | A small curated set spanning the launch body, skin, and hair choices | Presets only provide a starting point; they are not stored as identity. |
| Body presentation | slim, average, broad | Fixed height in the first art kit. Each is a separately authored compatible body set. |
| Head shape | round, oval, soft square | Facial placement remains consistent within each compatible head family. |
| Skin tone | eight illustrator-approved named tones | Names and ordering require representation review. Store palette IDs, not hexadecimal values. |
| Hair style | none, close-cropped, short, swept, bob, long, curly, coily, braids | Each style declares compatible headwear and head families. |
| Hair colour | black, dark brown, brown, blond, auburn, grey, white | Store palette IDs. |
| Facial hair | none, moustache, goatee, short beard, full beard | Must remain legible at 128 pixels and declare hair/head compatibility. |
| Top | T-shirt, long-sleeved top, jumper | Every top requires variants for all launch body sets and actions. |
| Bottom | trousers, shorts, skirt | Every bottom requires standing and seated variants. |
| Footwear | trainers, shoes, boots | Must align with standing and seated ankle anchors. |
| Clothing colours | black, white, grey, red, orange, yellow, green, blue, purple | Top, bottom, and footwear selections are stored independently. Contrast against outlines must pass review. |
| Headwear | none, beanie, headscarf, hijab | Hair/headwear compatibility is explicit. Headwear must not be treated as a hairstyle. |
| Glasses | none, round, rectangular | Frames use an approved high-contrast palette and follow the head rigidly. |
| Hearing device | none, left, right, bilateral | Side is identity state. Mirroring changes its visual side without changing the stored identity. |
| Mobility equipment | none, walking cane, manual wheelchair | Every launch action needs an approved equipment-specific template before it is selectable. |

### Explicitly deferred identity choices

The following require separate research, representation review, and art-kit
versions. They must not be approximated with scaling or reused artwork:

- child, teenager, and older-adult body proportions;
- height variation;
- powered wheelchairs, walkers, crutches, and communication devices;
- limb differences and prostheses;
- detailed facial identity editing;
- additional clothing styles, cultural clothing, jewellery, and personal aids;
- continuous body, face, or colour sliders.

Deferral does not mean these choices are unimportant. It prevents unreviewed or
misleading representations from being shipped as a shortcut.

## Symbol action state

The following values belong to a symbol and must not be copied into the saved
character identity.

| Slot | Proposed launch choices | Rules |
| --- | --- | --- |
| Action | neutral, wave, point, drink, read, sit | Each action is an artist-authored template for every supported body and equipment set. |
| Expression | neutral, happy, sad, surprised, speaking | Face variants keep the same identity geometry. |
| Left and right hand | relaxed, open, grip, pointing | Action defaults may recommend a hand, but the final stored choice remains explicit. |
| Prop | none, cup, book | Cup is compatible with drink; book is compatible with read. Other combinations remain unavailable until illustrated. |
| Equipment override | inherit identity, none, supported replacement | The UI states clearly when a symbol differs from the person's default equipment. |
| Mirroring | off, on | Mirroring swaps rendered sides, hands, prop attachment, and sided equipment while leaving identity data unchanged. |

Actions are fixed templates. The first release does not expose joint angles or
arbitrary limb rotation. This protects silhouette quality, prop contact, and
readability at AAC sizes.

## Compatibility behaviour

- Part definitions list compatible body sets, head families, actions, and
  equipment templates.
- The editor filters or disables incompatible choices before save.
- A previously valid saved configuration that is missing from the current
  manifest produces a controlled `unsupported_configuration` state. It is not
  rewritten automatically.
- Removing an option requires a new art-kit version and an explicit support
  policy for saved configurations.
- A cane uses an available hand. When both hands are occupied, only an
  illustrator-approved beside-character variant may be used.
- Wheelchair characters use seated action templates. A standing template is
  never substituted.
- Hair hidden by headwear remains an explicit compatible variant rather than a
  crop or mask generated at runtime.

## Review and approval

The launch matrix is approved only when all four groups sign off in the issue
or pull request review record:

| Reviewer | Responsibility |
| --- | --- |
| Product | Confirms scope, labels, defaults, and deferrals. |
| Illustrator | Confirms the matrix is achievable as one coherent art system. |
| AAC users and supporters | Confirm choices and actions are understandable and useful at symbol size. |
| People represented by accessibility and cultural choices | Confirm names, shapes, equipment use, and combinations are respectful and accurate. |
| Engineering | Confirms every choice maps to a stable, validatable manifest entry without hidden substitution. |

Research sessions must include keyboard and screen-reader users where relevant.
The repository records decisions and approved labels, but must not contain
participant-identifying research data.

## Launch acceptance

- Every launch choice has delivered, licensed, and approved artwork.
- Each identity remains recognisable across all six actions.
- Actions, expressions, hands, props, and equipment remain readable at 128,
  256, and 1024 pixels.
- No combination has visible gaps, doubled joint outlines, clothing tears, or
  unintended overlaps.
- Disabled combinations have a plain-English explanation.
- Identity changes update linked private previews without rewriting symbol
  action records.
