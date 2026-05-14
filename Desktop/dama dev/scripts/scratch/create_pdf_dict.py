import fitz

text_path = r'C:\Users\ADMIN\Desktop\mob app\clean_dictionary.txt'
pdf_path = r'C:\Users\ADMIN\Desktop\mob app\clean_dictionary.pdf'

doc = fitz.open()
page = doc.new_page()
where = fitz.Point(50, 50)
fontsize = 10
line_height = fontsize * 1.2

with open(text_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

current_y = 50
for line in lines:
    if current_y > page.rect.height - 50:
        page = doc.new_page()
        current_y = 50

    page.insert_text((50, current_y), line.strip(), fontsize=fontsize)
    current_y += line_height

doc.save(pdf_path)
doc.close()

print(f"✅ Created {pdf_path}")
