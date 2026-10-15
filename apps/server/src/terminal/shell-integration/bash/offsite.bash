__offsite_last=$_ __offsite_status=$? __offsite_values=("${PIPESTATUS[@]}")
builtin declare -a __offsite_last __offsite_status __offsite_errexit __offsite_running __offsite_ready __offsite_pipestatus __offsite_loop
builtin unset ENV
builtin export -n HISTFILE
builtin set +o posix
builtin shopt -u inherit_errexit 2>/dev/null
MAILCHECK=60
__offsite_errexit=0
__offsite_running=0
__offsite_ready=0
__offsite_ps1_mark=('' $'\001\e]6973;B\a\002')
__offsite_ps0_mark=('' $'\e]6973;C\a')
__offsite_ps1='${__offsite_ps1_mark+${__offsite_ps1_mark[${__offsite_ready-0}]-}}'
__offsite_ps0='${__offsite_ps0_mark[${__offsite_ready-0} ? (__offsite_running = 1, __offsite_ready = 0, 1) : 0]-}'
__offsite_trap='{ __offsite_returned; } 2>/dev/null'

__offsite_returned() {
    __offsite_last=$_ __offsite_status=$? __offsite_values=("${PIPESTATUS[@]}")
    if (( ${#BASH_SOURCE[@]} == 2 )) && [[ -o errexit ]]; then
        __offsite_errexit=1
        builtin set +e
    fi
}

__offsite_return() {
    builtin local index
    __offsite_pipestatus=0
    for index in "${!__offsite_values[@]}"; do
        __offsite_pipestatus+=",PIPESTATUS[$index]=${__offsite_values[index]}"
    done
    builtin return "$__offsite_status"
}

__offsite_prompt() {
    __offsite_status=$? __offsite_last=$1 __offsite_values=("${PIPESTATUS[@]}")
    builtin local attributes
    if [[ $__offsite_running == 1 ]]; then
        builtin printf '\e]6973;D;%s\a' "$__offsite_status"
    fi
    builtin printf '\e]6973;A\a'
    __offsite_running=0
    __offsite_ready=0
    if [[ -v PS1 && ${PS1@a} != *r* ]]; then
        attributes=${PS1@a}
        PS1=${PS1//"$__offsite_ps1"/}
        if [[ $attributes != *x* ]]; then
            if builtin shopt -q promptvars && [[ $PS1 != *\\ ]]; then
                PS1+=$__offsite_ps1
                __offsite_ready=1
            fi
            builtin export -n PS1
        fi
    fi
    if [[ ! -v PS0 || ${PS0@a} != *r* ]]; then
        attributes=
        if [[ -v PS0 ]]; then
            attributes=${PS0@a}
            PS0=${PS0//"$__offsite_ps0"/}
        fi
        if [[ $attributes != *x* ]]; then
            if (( __offsite_ready )) && [[ ${PS0-} != *\\ ]]; then
                PS0+=$__offsite_ps0
            fi
            if [[ -v PS0 ]]; then
                builtin export -n PS0
            fi
        fi
    fi
    if [[ ${PS0-} != *"$__offsite_ps0" ]]; then
        __offsite_ready=0
    fi
    __offsite_return
}

__offsite_setup() {
    builtin unset -f __offsite_returned __offsite_setup
    builtin unset __offsite_trap
    builtin local commands=${PROMPT_COMMAND-}
    if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
        commands=${PROMPT_COMMAND[*]-}
    fi
    if (( BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4) )) && [[ ! -v PROMPT_COMMAND || ${PROMPT_COMMAND@a} != *[rx]* ]] && [[ -n $commands || -z $1 ]]; then
        PROMPT_COMMAND='for ((__offsite_loop = 1; __offsite_loop--; __offsite_pipestatus)); do __offsite_prompt "$_" && ((1)); done 2> /dev/null'${PROMPT_COMMAND:+"; $PROMPT_COMMAND"}
        builtin export -n PROMPT_COMMAND
    else
        builtin unset -f __offsite_prompt
        builtin unset __offsite_running __offsite_ready __offsite_ps1_mark __offsite_ps0_mark __offsite_ps1 __offsite_ps0
    fi
    if (( __offsite_errexit )); then
        builtin set -e
    fi
    builtin unset __offsite_errexit
    __offsite_return
}

builtin trap "$__offsite_trap" RETURN
if [[ -e /etc/profile ]]; then
    builtin source /etc/profile
fi
if (( __offsite_errexit )); then
    __offsite_errexit=0
    builtin set -e
fi
if [[ -e $HOME/.bash_profile ]]; then
    builtin source "$HOME/.bash_profile"
elif [[ -e $HOME/.bash_login ]]; then
    builtin source "$HOME/.bash_login"
elif [[ -e $HOME/.profile ]]; then
    builtin source "$HOME/.profile"
fi
if [[ $(builtin trap -p RETURN) == "trap -- '$__offsite_trap' RETURN" ]]; then builtin trap - RETURN; fi 2>/dev/null
for ((__offsite_loop = 1; __offsite_loop--; __offsite_pipestatus)); do __offsite_setup "$(builtin trap -p DEBUG)" "$__offsite_last" && ((1)); done 2>/dev/null
