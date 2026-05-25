# Common Findings and Code Fixes

Reference for mapping Testomniac findings to concrete code fixes.

## Page Health Findings

### Broken Images
**Finding:** `N broken image(s) detected`
**Fix:** Check the `src` attribute. Common causes:
- Wrong path: use relative paths from the public directory
- Missing file: verify the image exists at the specified path
- CDN issue: check if the CDN URL is correct and accessible
```html
<!-- Before -->
<img src="/images/old-path.png" alt="Product">
<!-- After -->
<img src="/images/correct-path.png" alt="Product">
```

### Overlapping Elements
**Finding:** `N interactive element(s) obscured by transparent overlapping content`
**Fix:** The overlapping element has no visible background but blocks
clicks. Either remove it, set `pointer-events: none`, or fix its
z-index/positioning.
```css
.overlay-element {
  pointer-events: none; /* Let clicks pass through */
}
```

### Dead Social Share Buttons
**Finding:** `N social share button(s) are non-functional`
**Fix:** Social share buttons link to `#` instead of share URLs.
Replace with proper share URLs:
```html
<!-- Before -->
<a href="#" class="social-facebook">Facebook</a>
<!-- After -->
<a href="https://www.facebook.com/sharer/sharer.php?u=PAGE_URL" class="social-facebook" target="_blank" rel="noopener">Facebook</a>
```

### Links with No Destination
**Finding:** `N link(s) with no real destination`
**Fix:** Links point to `#` or have empty `href`. Either add a real
destination or use a button instead:
```html
<!-- Before -->
<a href="#">Click me</a>
<!-- After -->
<button onclick="handleClick()">Click me</button>
```

### Missing rel="noopener"
**Finding:** `N external link(s) missing rel="noopener"`
**Fix:** Add `rel="noopener"` to all external links with
`target="_blank"` to prevent reverse tabnabbing:
```html
<a href="https://example.com" target="_blank" rel="noopener">Link</a>
```

### Small Touch Targets
**Finding:** `N interactive element(s) smaller than 24x24px`
**Fix:** Increase the clickable area. WCAG recommends 44x44px minimum:
```css
.small-button {
  min-width: 44px;
  min-height: 44px;
  padding: 10px;
}
```

### Placeholder Text
**Finding:** `Placeholder text in content area`
**Fix:** Replace Lorem Ipsum with real content:
```html
<!-- Before -->
<p>Nam nec tellus a odio tincidunt auctor...</p>
<!-- After -->
<p>Actual product description here.</p>
```

### Price Format Errors
**Finding:** `Price displayed with incorrect decimal format`
**Fix:** Format prices to exactly 2 decimal places:
```javascript
// Before: "46.000"
// After: "46.00"
price.toFixed(2)
```

### Grammar: Singular/Plural
**Finding:** `Grammar error: "1 results"`
**Fix:** Use conditional pluralization:
```javascript
`Showing ${count} ${count === 1 ? 'result' : 'results'}`
```

### Duplicate Breadcrumbs
**Finding:** `Duplicate breadcrumb navigation`
**Fix:** Remove the duplicate breadcrumb element. Check for components
rendered twice (common with SSR hydration or duplicate includes).

### Error Messages in DOM
**Finding:** `Error message present in DOM` / `Error message visible on page`
**Fix:** Validation error messages should be hidden until triggered.
Check for server-side error text being rendered unconditionally:
```html
<!-- Before: always visible -->
<span class="error">Maximum purchase amount of 0</span>
<!-- After: conditionally shown -->
<span class="error" v-if="showError">{{ errorMessage }}</span>
```

### Empty Product Page
**Finding:** `Product page has no content`
**Fix:** The product data is not loading. Check:
- API endpoint returning data for this product ID
- Component conditional rendering (is it waiting for data?)
- Route parameters being passed correctly

### Missing Product Image
**Finding:** `Product page has no product image`
**Fix:** Add an `<img>` element within the product detail area, or fix
the image source if it's missing from the data.

### Invalid Prices
**Finding:** `N invalid price(s): zero, negative, or NaN`
**Fix:** Validate price data before rendering. Filter out $0.00 items
or show "Price unavailable" instead.

### Product Price Behind Login
**Finding:** `Product price hidden behind login`
**Fix:** Either show prices to all visitors or explicitly indicate
"Sign in to see pricing" with a clear CTA.

### Missing Stock Information
**Finding:** `Product page missing stock information`
**Fix:** Add stock/availability indicator near the add-to-cart button:
```html
<span class="stock-status">In Stock (12 available)</span>
```

### Horizontal Overflow
**Finding:** `Page has horizontal overflow`
**Fix:** Find the element causing overflow. Common causes:
```css
/* Add to the root or overflowing container */
.container {
  overflow-x: hidden; /* Quick fix */
  max-width: 100vw;   /* Better fix */
}
```

## Expertise Findings

### SEO

**Missing meta description:**
```html
<meta name="description" content="Page description here (150-160 chars)">
```

**Missing Open Graph tags:**
```html
<meta property="og:title" content="Page Title">
<meta property="og:description" content="Description">
<meta property="og:image" content="https://example.com/image.jpg">
```

**Missing canonical URL:**
```html
<link rel="canonical" href="https://example.com/page">
```

### Accessibility

**Missing lang attribute:**
```html
<html lang="en">
```

**Missing form labels:**
```html
<!-- Before -->
<input type="text" name="email">
<!-- After -->
<label for="email">Email</label>
<input type="text" id="email" name="email">
```

**Missing image alt text:**
```html
<img src="photo.jpg" alt="Descriptive text about the image">
```

**Missing main landmark:**
```html
<main>
  <!-- Page content here -->
</main>
```

### Security

**API keys in URLs:**
Remove API keys from query parameters and use headers instead:
```javascript
// Before
fetch(`/api?key=${API_KEY}`)
// After
fetch('/api', { headers: { 'Authorization': `Bearer ${API_KEY}` } })
```

**Insecure HTTP requests:**
Use HTTPS for all external requests:
```javascript
// Before
fetch('http://api.example.com/data')
// After
fetch('https://api.example.com/data')
```

### Performance

**Slow responses (>3s):**
- Check server-side query performance
- Add loading indicators for slow operations
- Consider caching or pagination

**Console errors on load:**
Check the browser console for JavaScript errors. Common causes:
- Missing dependencies
- Undefined variables
- Failed API calls
