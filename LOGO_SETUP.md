# How to Add Your Shop Logo

Your app is now ready to display your shop logo in the top right corner of every page!

## Steps to Add Your Logo:

### 1. Prepare Your Logo Image

- **Recommended format:** PNG (with transparent background) or JPG
- **Recommended size:** Square image (e.g., 500x500px or 1000x1000px)
- **File name:** Rename your logo file to `logo.png` (or `logo.jpg`)

### 2. Add Logo to Your Project

**Option A: Using File Explorer/Finder**
1. Open the folder: `/Users/dhiraj/Documents/TestVibe/`
2. Copy your logo file into this folder
3. Make sure it's named `logo.png` (or update the HTML if using a different name)

**Option B: Using Command Line**
```bash
# Navigate to project folder
cd /Users/dhiraj/Documents/TestVibe/

# Copy your logo (replace the path with your actual logo location)
cp /path/to/your/logo.png logo.png
```

### 3. Refresh Your App

- Open your app in the browser
- Hard refresh: **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows)
- You should see your logo in the top right corner!

## Logo Specifications

- **Size on screen:** 50x50 pixels
- **Position:** Top right corner of the header
- **No layout impact:** Logo is positioned absolutely, so it doesn't push content down
- **Styling:** Slight transparent white background with rounded corners

## If Using a Different File Name

If your logo is named differently (e.g., `shop-logo.jpg`), update these files:

**In `index.html`, `history.html`, and `dashboard.html`, change:**
```html
<img src="logo.png" alt="Shop Logo" id="shopLogo">
```

**To:**
```html
<img src="shop-logo.jpg" alt="Shop Logo" id="shopLogo">
```

## Customizing Logo Size

If you want to make the logo bigger or smaller, edit `style.css`:

```css
.header-logo {
    width: 60px;   /* Change this value */
    height: 60px;  /* Change this value */
}
```

## No Logo? No Problem!

If you don't have a logo yet:
- The app will show a broken image icon (which is fine)
- Or you can remove the logo section from the HTML
- Or create a simple text-based logo using a free tool like Canva

---

Your logo will appear on all three pages:
- ✅ Entry Form (index.html)
- ✅ History Page (history.html)
- ✅ Dashboard (dashboard.html)
