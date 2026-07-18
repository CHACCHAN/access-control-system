apt update
apt install -y --no-install-recommends xserver-xorg xinit
apt install -y libwebkit2gtk-4.1-0 libayatana-appindicator3-1 librsvg2-2 openbox x11-xserver-utils alsa-utils alsa-tools
apt install -y pipewire-audio pipewire-pulse gstreamer1.0-plugins-ugly gstreamer1.0-libav
apt install -y pulseaudio-utils gstreamer1.0-tools gstreamer1.0-pipewire gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad
amixer -c 0 sset Master unmute
dpkg -i access-control-system.deb
apt install -f -y
cat > ~/.xinitrc << 'EOF'
openbox &
exec access-control-system
EOF
