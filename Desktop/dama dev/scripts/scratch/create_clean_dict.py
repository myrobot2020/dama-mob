import fitz
import re

pdf_path = r'C:\Users\ADMIN\Desktop\mob app\docs2\dictionary.pdf'
output_path = r'C:\Users\ADMIN\Desktop\mob app\clean_dictionary.txt'

words = set()
doc = fitz.open(pdf_path)

# Dictionary concepts to prioritize (based on typical Buddhist dictionary structure)
# We want to extract the bolded terms which are often concepts
for page in doc:
    text = page.get_text()
    # Find words that are likely English concepts (lowercase, 3+ chars, only a-z)
    found = re.findall(r'\b[a-z]{3,}\b', text.lower())
    for word in found:
        words.add(word)

# Add some common specific terms to ensure coverage
common_terms = [
    "abandonment", "higher powers", "covetousness", "truth-realization",
    "habitual karma", "hatelessness", "determination", "morality",
    "concentration", "wisdom", "suffering", "impermanence", "egolessness",
    "monk", "forest", "household life", "birth", "death", "enlightenment",
    "meditation", "teaching", "pilgrimage", "asceticism", "brahmin", "sacrifice"
]
for term in common_terms:
    for word in term.split():
        words.add(word.lower())

with open(output_path, 'w', encoding='utf-8') as f:
    for word in sorted(list(words)):
        f.write(word + '\n')

print(f"✅ Created clean_dictionary.txt with {len(words)} words.")
