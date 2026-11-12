#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <sys/wait.h>

extern char **environ;
static pid_t child;

static void forward(int signal_number) {
  if (child > 0) {
    kill(child, signal_number);
  }
}

int main(int argc, char **argv) {
  if (argc != 2) {
    fprintf(stderr, "usage: offsite <start script>\n");
    return 2;
  }
  char *arguments[] = {"/bin/sh", argv[1], NULL};
  if (posix_spawn(&child, "/bin/sh", NULL, NULL, arguments, environ) != 0) {
    perror("offsite could not start its start script");
    return 1;
  }
  signal(SIGTERM, forward);
  signal(SIGINT, forward);
  signal(SIGHUP, forward);
  int status;
  while (waitpid(child, &status, 0) < 0) {
  }
  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return 1;
}
