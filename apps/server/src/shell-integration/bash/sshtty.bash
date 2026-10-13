__sshtty_last=$_ __sshtty_status=$? __sshtty_values=("${PIPESTATUS[@]}")
builtin declare -a __sshtty_last __sshtty_status __sshtty_errexit __sshtty_running __sshtty_ready __sshtty_pipestatus __sshtty_loop
builtin unset ENV
builtin export -n HISTFILE
builtin set +o posix
builtin shopt -u inherit_errexit 2>/dev/null
MAILCHECK=60
__sshtty_errexit=0
__sshtty_running=0
__sshtty_ready=0
__sshtty_ps1_mark=('' $'\001\e]6973;B\a\002')
__sshtty_ps0_mark=('' $'\e]6973;C\a')
__sshtty_ps1='${__sshtty_ps1_mark+${__sshtty_ps1_mark[${__sshtty_ready-0}]-}}'
__sshtty_ps0='${__sshtty_ps0_mark[${__sshtty_ready-0} ? (__sshtty_running = 1, __sshtty_ready = 0, 1) : 0]-}'
__sshtty_trap='{ __sshtty_returned; } 2>/dev/null'

__sshtty_returned() {
    __sshtty_last=$_ __sshtty_status=$? __sshtty_values=("${PIPESTATUS[@]}")
    if (( ${#BASH_SOURCE[@]} == 2 )) && [[ -o errexit ]]; then
        __sshtty_errexit=1
        builtin set +e
    fi
}

__sshtty_return() {
    builtin local index
    __sshtty_pipestatus=0
    for index in "${!__sshtty_values[@]}"; do
        __sshtty_pipestatus+=",PIPESTATUS[$index]=${__sshtty_values[index]}"
    done
    builtin return "$__sshtty_status"
}

__sshtty_prompt() {
    __sshtty_status=$? __sshtty_last=$1 __sshtty_values=("${PIPESTATUS[@]}")
    builtin local attributes
    if [[ $__sshtty_running == 1 ]]; then
        builtin printf '\e]6973;D;%s\a' "$__sshtty_status"
    fi
    builtin printf '\e]6973;A\a'
    __sshtty_running=0
    __sshtty_ready=0
    if [[ -v PS1 && ${PS1@a} != *r* ]]; then
        attributes=${PS1@a}
        PS1=${PS1//"$__sshtty_ps1"/}
        if [[ $attributes != *x* ]]; then
            if builtin shopt -q promptvars && [[ $PS1 != *\\ ]]; then
                PS1+=$__sshtty_ps1
                __sshtty_ready=1
            fi
            builtin export -n PS1
        fi
    fi
    if [[ ! -v PS0 || ${PS0@a} != *r* ]]; then
        attributes=
        if [[ -v PS0 ]]; then
            attributes=${PS0@a}
            PS0=${PS0//"$__sshtty_ps0"/}
        fi
        if [[ $attributes != *x* ]]; then
            if (( __sshtty_ready )) && [[ ${PS0-} != *\\ ]]; then
                PS0+=$__sshtty_ps0
            fi
            if [[ -v PS0 ]]; then
                builtin export -n PS0
            fi
        fi
    fi
    if [[ ${PS0-} != *"$__sshtty_ps0" ]]; then
        __sshtty_ready=0
    fi
    __sshtty_return
}

__sshtty_setup() {
    builtin unset -f __sshtty_returned __sshtty_setup
    builtin unset __sshtty_trap
    builtin local commands=${PROMPT_COMMAND-}
    if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
        commands=${PROMPT_COMMAND[*]-}
    fi
    if (( BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4) )) && [[ ! -v PROMPT_COMMAND || ${PROMPT_COMMAND@a} != *[rx]* ]] && [[ -n $commands || -z $1 ]]; then
        PROMPT_COMMAND='for ((__sshtty_loop = 1; __sshtty_loop--; __sshtty_pipestatus)); do __sshtty_prompt "$_" && ((1)); done 2> /dev/null'${PROMPT_COMMAND:+"; $PROMPT_COMMAND"}
        builtin export -n PROMPT_COMMAND
    else
        builtin unset -f __sshtty_prompt
        builtin unset __sshtty_running __sshtty_ready __sshtty_ps1_mark __sshtty_ps0_mark __sshtty_ps1 __sshtty_ps0
    fi
    if (( __sshtty_errexit )); then
        builtin set -e
    fi
    builtin unset __sshtty_errexit
    __sshtty_return
}

builtin trap "$__sshtty_trap" RETURN
if [[ -e /etc/profile ]]; then
    builtin source /etc/profile
fi
if (( __sshtty_errexit )); then
    __sshtty_errexit=0
    builtin set -e
fi
if [[ -e $HOME/.bash_profile ]]; then
    builtin source "$HOME/.bash_profile"
elif [[ -e $HOME/.bash_login ]]; then
    builtin source "$HOME/.bash_login"
elif [[ -e $HOME/.profile ]]; then
    builtin source "$HOME/.profile"
fi
if [[ $(builtin trap -p RETURN) == "trap -- '$__sshtty_trap' RETURN" ]]; then builtin trap - RETURN; fi 2>/dev/null
for ((__sshtty_loop = 1; __sshtty_loop--; __sshtty_pipestatus)); do __sshtty_setup "$(builtin trap -p DEBUG)" "$__sshtty_last" && ((1)); done 2>/dev/null
