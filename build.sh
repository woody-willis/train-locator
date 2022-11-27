#!/bin/sh

# Check if apktool is installed and install it if not
if ! [ -x "$(command -v apktool)" ]; then
    echo 'Installing apktool...' >&2
    export HOMEBREW_NO_AUTO_UPDATE=1
    brew install apktool
    export HOMEBREW_NO_AUTO_UPDATE=0
fi

cd "$( dirname "$0" )"
cd android

# Build APK
androidjs build --release

# Change package name of APK
cd dist
mkdir -p build
apktool d -f trainly.apk -o build
cd build
sed -i '' 's/com.androidjs.trainly/uk.co.trainly.trainly/g' AndroidManifest.xml
apktool b -o ../trainly.apk
cd ..

# Sign APK
curl -s -o signapk.sh https://raw.githubusercontent.com/onbiron/apk-resigner/master/signapk.sh
chmod +x signapk.sh
./signapk.sh trainly.apk ../../trainly.keystore trainly trainly

# Zipalign APK
rm -f trainly-aligned.apk
/Users/$(id -un)/Library/Android/sdk/build-tools/33.0.0/zipalign -v 4 trainly.apk trainly-aligned.apk

# Clean up
rm -rf build
rm -f trainly.apk
rm -f signapk.sh