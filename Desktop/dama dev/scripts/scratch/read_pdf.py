import fitz
doc = fitz.open(r'C:\Users\ADMIN\Desktop\mob app\docs2\dictionary.pdf')
# Let's look for actual dictionary entries starting from page 6
for i in range(5, 10):
    print(f"--- Page {i+1} ---")
    print(doc[i].get_text())
doc.close()
