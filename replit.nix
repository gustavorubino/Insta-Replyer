{ pkgs }: {
  deps = [
    pkgs.wget
    pkgs.openssh
    pkgs.bashInteractive
    pkgs.nano
  ];
}