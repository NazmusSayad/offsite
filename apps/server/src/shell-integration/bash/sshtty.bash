builtin unset ENV
builtin export -n HISTFILE
builtin set +o posix
builtin shopt -u inherit_errexit 2>/dev/null

if builtin shopt -q login_shell; then
    if [[ -r /etc/profile ]]; then
        builtin source /etc/profile
    fi
    for __sshtty_file in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
        if [[ -r $__sshtty_file ]]; then
            builtin source "$__sshtty_file"
            break
        fi
    done
else
    for __sshtty_file in /etc/bash.bashrc /etc/bash/bashrc /etc/bashrc; do
        if [[ -r $__sshtty_file ]]; then
            builtin source "$__sshtty_file"
            break
        fi
    done
    if [[ -r $HOME/.bashrc ]]; then
        builtin source "$HOME/.bashrc"
    fi
fi
builtin unset __sshtty_file

if (( BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4) )); then
    __sshtty_status=0
    __sshtty_running=0

    __sshtty_save_status() {
        __sshtty_status=$?
        builtin return "$__sshtty_status"
    }

    __sshtty_prompt() {
        if [[ $__sshtty_running == 1 ]]; then
            builtin printf '\e]133;D;%s\a' "$__sshtty_status"
        fi
        __sshtty_running=0
        if [[ ${PS1-} != *'133;A'* ]]; then
            builtin printf '\e]133;A\a'
        fi
        if [[ ${PS1-} != *'133;B'* ]]; then
            PS1+='\[\e]133;B\a\]'
        fi
        if builtin shopt -q promptvars && [[ ${PS0-} != *'133;C'* ]]; then
            PS0+='${__sshtty_running:0:$((__sshtty_running=1,0))}\e]133;C\a'
        fi
    }

    if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )) && [[ -v PROMPT_COMMAND && ${PROMPT_COMMAND@a} == *a* ]]; then
        PROMPT_COMMAND=('__sshtty_save_status 2>/dev/null' "${PROMPT_COMMAND[@]}" '__sshtty_prompt 2>/dev/null')
    else
        PROMPT_COMMAND='__sshtty_save_status 2>/dev/null'$'\n'"${PROMPT_COMMAND-}"$'\n''__sshtty_prompt 2>/dev/null'
    fi
fi
