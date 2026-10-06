" Runs the real vim-indent-object plugin over every fixture and records the
" line range each key sequence yanks. Driven by make-oracle.cjs, which sets
" $PLUGIN, $FIXTURES and $OUT.
set nocompatible tabstop=4 shiftwidth=4 noexpandtab

" Returns [first, last] (1-based) of a linewise yank, or v:null.
function! s:Run(lines, lnum, keys) abort
  " Re-sourcing resets the plugin's script-local selection memory.
  execute 'source' fnameescape($PLUGIN)
  silent %delete _
  call setline(1, a:lines)
  call setreg('"', 'x', 'v')
  call cursor(a:lnum, 1)
  try
    execute 'normal ' . a:keys
  catch
    return v:null
  endtry
  if getregtype('"') !=# 'V'
    return v:null
  endif
  return [line("'["), line("']")]
endfunction

let s:out = []
for s:fx in json_decode(join(readfile($FIXTURES), "\n"))
  let s:cases = []
  for s:lnum in range(1, len(s:fx.lines))
    for s:obj in ['ii', 'ai', 'iI', 'aI']
      let s:c = {'line': s:lnum, 'obj': s:obj}
      for s:n in [1, 2, 3]
        " y{n}{obj}: the plugin's own operator-pending count.
        let s:c['op' . s:n] = s:Run(s:fx.lines, s:lnum, 'y' . (s:n > 1 ? s:n : '') . s:obj)
        " v{obj}{obj}...: the object pressed n times in Visual mode.
        let s:c['vis' . s:n] = s:Run(s:fx.lines, s:lnum, 'v' . repeat(s:obj, s:n) . 'y')
      endfor
      call add(s:cases, s:c)
    endfor
  endfor
  call add(s:out, {'name': s:fx.name, 'lines': s:fx.lines, 'cases': s:cases})
endfor
call writefile([json_encode(s:out)], $OUT)
qall!
