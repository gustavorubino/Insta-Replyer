{ pkgs }: {
  deps = [
    pkgs.gh
    pkgs.lsof
    pkgs.psmisc
    pkgs.wget
    pkgs.openssh
    pkgs.bashInteractive
    pkgs.nano
  ];
}