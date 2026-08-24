# Modular SVG avatar system

OpenSymbols will replace the current single-artwork character prototype with a
versioned library of illustrator-authored SVG parts. One saved character holds
identity choices. A separate symbol record holds an action, expression, hands,
prop, equipment override, and mirroring. This separation allows the same person
to appear consistently across many private AAC symbols.

The engineering prototype at `opensymbols-svg-parts-lab` proved that SVG parts
can be joined, layered, recoloured, and exported. Its drawings are test art and
must not be copied into this repository. The supplied example character is also
a visual reference only. Production contours must be delivered and approved as
a coherent new art kit.

## Documents

- [Launch attribute matrix](launch-attributes.md) defines which choices belong
  to a person's identity, which belong to a symbol, the proposed first-release
  options, and the required representation review.
- [SVG authoring contract](svg-authoring-contract.md) defines how an illustrator
  delivers parts that the planned registry, renderer, validator, and export
  pipeline can use safely.

Both documents are release gates. Production illustration must not begin until
product, illustration, accessibility, and engineering reviewers approve the
matrix and contract. Approval of a later art-kit version does not automatically
approve new identity attributes or actions.

## Product boundary

The first system is flat, front-facing, and uses fixed artist-authored action
templates. It is not a free-pose animation tool. The interface exposes
meaningful choices such as hairstyle or glasses; connector IDs and individual
limb artwork remain implementation details.
