$(document).ready () ->
  prContainer = $('#pull_requests')
  prLoader = $('#pull_requests_loading')
  if prContainer.length > 0
    prContainer.load( prContainer.attr('rel'), () ->
      prLoader.slideUp('fast')
      if prContainer.children().length > 0
        prContainer.slideDown('fast')
        prContainer.find('#see_all').click () ->
          $(this).remove();
          $('#log').slideDown()
    )

  meContainer = $('#me')
  meLoader = $('#me_loading')
  if meContainer.length > 0
    meContainer.load( meContainer.attr('rel'), () ->
      meLoader.slideUp('fast')
      if meContainer.children().length > 0
        meContainer.slideDown('fast')
    )
