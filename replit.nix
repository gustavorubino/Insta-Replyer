{ pkgs }: {
  deps = [
    pkgs.psmisc
    pkgs.wget
    pkgs.openssh
    pkgs.bashInteractive
    pkgs.nano
  ];
}