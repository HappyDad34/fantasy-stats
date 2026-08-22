# Run once locally: python generate_icons.py
import urllib.request

# Download standard football helmet app icons
urllib.request.urlretrieve("https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f3c8.png", "icon-192.png")
urllib.request.urlretrieve("https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f3c8.png", "icon-512.png")
print("Icons generated!")