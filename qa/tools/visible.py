#!/usr/bin/env python3
"""Print every element with text or an accessibility label from a `maestro hierarchy` dump, with its bounds."""
import json, sys

raw = open(sys.argv[1]).read()
tree = json.loads(raw[raw.find('{'):])
seen = set()

def walk(node):
    a = node.get('attributes', {})
    label = a.get('accessibilityText') or a.get('text') or a.get('resource-id')
    if label:
        key = (label, a.get('bounds'))
        if key not in seen:
            seen.add(key)
            extra = []
            if a.get('resource-id') and a.get('resource-id') != label:
                extra.append('id=' + a['resource-id'])
            if a.get('enabled') == 'false':
                extra.append('disabled')
            print(f"{label!r:70} {a.get('bounds', '')} {' '.join(extra)}")
    for child in node.get('children', []):
        walk(child)

walk(tree)
