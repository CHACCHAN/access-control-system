apt update
apt install -y --no-install-recommends xserver-xorg xinit
apt install -y libwebkit2gtk-4.1-0 libayatana-appindicator3-1 librsvg2-2 openbox x11-xserver-utils
dpkg -i access-control-system.deb
apt install -f -y
cat > ~/.xinitrc << 'EOF'
openbox &
exec access-control-system
EOF
