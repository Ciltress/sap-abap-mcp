# Repairing and cleaning up HTML and XML documents

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Repairing and Cleaning up HTML and XML Documents

---

## Repairing and Cleaning up HTML and XML Documents

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_HTMLTIDY</code> </td>
<td>

- The `CL_HTMLTIDY` class repairs and cleans up HTML and XML documents.
- It fixes coding errors like missing or incorrect tags, converting documents into well-formatted versions.
- It performs tasks such as indentation adjustments and removes unnecessary markup and comments.
- The class allows customization of formatting options.
- The ABAP class uses HTML Tidy. Refer to the links available in the class's ABAP Doc comment.

<br>

<details>
  <summary>🟢 Click to expand for example code</summary>
  <!-- -->

<br>

The following example explores some of the capabilities of the `CL_HTMLTIDY` class:

- Repairing and cleaning up an HTML document
  - Creating an HTMLTidy instance
  - Resetting all option settings to default values
  - Getting default values of option settings
  - Setting options explicitly
  - Getting set options
  - Evaluating the cleanup operation result
- Repairing and cleaning up an XML document
  
To try the example out, create a demo class named `zcl_demo_abap` and paste the code into it. After activation, choose *F9* in ADT to execute the class. The example is set up to display output in the console.


```abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.
    CLASS-METHODS is_successful IMPORTING option  TYPE string
                                          success TYPE abap_boolean
                                          out     TYPE REF TO  if_oo_adt_classrun_out.
ENDCLASS.



CLASS zcl_demo_abap IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.

    "Options
    "Refer to the links available in the ABAP Doc comment of the CL_HTMLTIDY class.
    DATA(options_tab) = VALUE string_table(
      "Document display options
      ( `gnu-emacs` )
      ( `markup` )
      ( `mute` )
      ( `mute-id` )
      ( `quiet` )
      ( `show-body-only` )
      ( `show-errors` )
      ( `show-info` )
      ( `show-warnings` )
      "Document in and out options
      ( `add-meta-charset` )
      ( `add-xml-decl` )
      ( `add-xml-space` )
      ( `doctype` )
      ( `input-xml` )
      ( `output-html` )
      ( `output-xhtml` )
      ( `output-xml` )
      "File input output options
      ( `error-file` )
      ( `keep-time` )
      ( `output-file` )
      ( `write-back` )
      "Diagnostics options
      ( `accessibility-check` )
      ( `force-output` )
      ( `show-meta-change` )
      ( `warn-proprietary-attributes` )
      "Encoding options
      ( `char-encoding` )
      ( `input-encoding` )
      ( `newline` )
      ( `output-bom` )
      ( `output-encoding` )
      "Cleanup options
      ( `bare` )
      ( `clean` )
      ( `drop-empty-elements` )
      ( `drop-empty-paras` )
      ( `drop-proprietary-attributes` )
      ( `gdoc` )
      ( `logical-emphasis` )
      ( `merge-divs` )
      ( `merge-spans` )
      ( `word-2000` )
      "Entities options
      ( `ascii-chars` )
      ( `ncr` )
      ( `numeric-entities` )
      ( `preserve-entities` )
      ( `quote-ampersand` )
      ( `quote-marks` )
      ( `quote-nbsp` )
      "Repair options
      ( `alt-text` )
      ( `anchor-as-name` )
      ( `assume-xml-procins` )
      ( `coerce-endtags` )
      ( `css-prefix` )
      ( `custom-tags` )
      ( `enclose-block-text` )
      ( `enclose-text` )
      ( `escape-scripts` )
      ( `fix-backslash` )
      ( `fix-bad-comments` )
      ( `fix-style-tags` )
      ( `fix-uri` )
      ( `literal-attributes` )
      ( `lower-literals` )
      ( `repeated-attributes` )
      ( `skip-nested` )
      ( `strict-tags-attributes` )
      ( `uppercase-attributes` )
      ( `uppercase-tags` )
      "Transformation options
      ( `decorate-inferred-ul` )
      ( `escape-cdata` )
      ( `hide-comments` )
      ( `join-classes` )
      ( `join-styles` )
      ( `merge-emphasis` )
      ( `replace-color` )
      "Teaching tidy options
      ( `new-blocklevel-tags` )
      ( `new-empty-tags` )
      ( `new-inline-tags` )
      ( `new-pre-tags` )
      "Pretty print options
      ( `break-before-br` )
      ( `indent` )
      ( `indent-attributes` )
      ( `indent-cdata` )
      ( `indent-spaces` )
      ( `indent-with-tabs` )
      ( `keep-tabs` )
      ( `omit-optional-tags` )
      ( `priority-attributes` )
      ( `punctuation-wrap` )
      ( `sort-attributes` )
      ( `tab-size` )
      ( `tidy-mark` )
      ( `vertical-space` )
      ( `wrap` )
      ( `wrap-asp` )
      ( `wrap-attributes` )
      ( `wrap-jste` )
      ( `wrap-php` )
      ( `wrap-script-literals` )
      ( `wrap-sections` ) ).

**********************************************************************

    out->write( |******************************** Repairing and cleaning up an HTML document ********************************\n| ).

    "Creating an HTMLTidy instance
    DATA(htmltidy) = cl_htmltidy=>create( ).

**********************************************************************

    "Resetting all option settings to default values
    DATA success TYPE c LENGTH 1.
    htmltidy->reset_options( IMPORTING success = success ).

    out->write( |***************** Resetting options *****************\n| ).
    IF success IS INITIAL.
      out->write( `Resetting all option settings to default values not successful.` ).
    ELSE.
      out->write( `Resetting all option settings to default values successful.` ).
    ENDIF.
    out->write( |\n\n\n| ).

**********************************************************************

    "Getting default values of option settings

    "Internal table to visualize options and their values
    TYPES: BEGIN OF options_struc,
             option  TYPE string,
             value   TYPE string,
             success TYPE c LENGTH 1,
           END OF options_struc,
           tt_options TYPE TABLE OF options_struc WITH EMPTY KEY.

    DATA default_values TYPE tt_options.

    LOOP AT options_tab REFERENCE INTO DATA(opt).
      htmltidy->get_default(
        EXPORTING
          option  = opt->*
        IMPORTING
          value   = DATA(opt_value)
          success = success ).

      APPEND VALUE #( option = opt->* value = opt_value success = success ) TO default_values.
    ENDLOOP.

    "You might set a break point and check out the default values (if any).

**********************************************************************

    "Setting options explicitly
    "The following code demonstrates exemplary option settings.

    "Adding a met tag including the charset attribute
    htmltidy->set_option( EXPORTING option  = 'add-meta-charset'
                                    value   = 'yes'
                          IMPORTING success = success ).

    is_successful( option = `add-meta-charset` out = out success = success ).

    "Omitting the DOCTYPE declaration
    htmltidy->set_option( EXPORTING option  = 'doctype'
                                    value   = 'omit'
                          IMPORTING success = success ).

    is_successful( option = `doctype` out = out success = success ).

    "Indenting tags
    htmltidy->set_option( EXPORTING option  = 'indent'
                                    value   = 'auto'
                          IMPORTING success = success ).

    is_successful( option = `indent` out = out success = success ).

    "Avoiding an extra meta tag indicating that the code was cleaned up
    htmltidy->set_option( EXPORTING option  = 'tidy-mark'
                                    value   = 'no'
                          IMPORTING success = success ).

    is_successful( option = `tidy-mark` out = out success = success ).

    "Specifying the right margin for line wrapping
    htmltidy->set_option( EXPORTING option  = 'wrap'
                                    value   = '80'
                          IMPORTING success = success ).

    is_successful( option = `wrap` out = out success = success ).

    "Removing comments
    htmltidy->set_option( EXPORTING option  = 'hide-comments'
                                    value   = 'yes'
                          IMPORTING success = success ).

    is_successful( option = `hide-comments` out = out success = success ).

**********************************************************************

    "Getting set options
    DATA option_values TYPE tt_options.

    LOOP AT options_tab REFERENCE INTO opt.
      htmltidy->get_option(
        EXPORTING
          option  = opt->*
        IMPORTING
          value   = opt_value
          success = success ).

      APPEND VALUE #( option = opt->*
                      value = COND #( WHEN success IS INITIAL THEN `no value set` ELSE opt_value )
                      success = success ) TO option_values.
    ENDLOOP.

    out->write( |***************** Set options *****************\n\n| ).
    out->write( option_values ).
    out->write( |\n\n\n| ).

**********************************************************************

    "Demo HTML code to be repaired and cleaned up
    DATA(html) =
    `<!DOCTYPE html> <html>` && "DOCTYPE used
    `    ` && "Missing <head> tag
    `<title>Sample HTML Page    <title>` && "Wrong closing tag, / missing
    `       </head>        <body>` &&
    `<h1>Heading 1     </h5>` && "White spaces, Wrong </h5> closing tag
    `<p>          This is a paragraph.       </p>` && "White spaces
    ` <!-- Some comment --> ` && "Comment that will be hidden
    `                    <h2>Heading 2</h2>` &&
    `<p>Some text</>` && "Wrong closing tag, </p> tag is added and </> is transformed to &lt;/&gt;
    "Long text that will be wrapped
    `<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore ` &&
    `et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut ` &&
    `aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum ` &&
    `dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui ` &&
    `officia deserunt mollit anim id est laborum.</p>` &&
    `<nope><p>Some bullet points:</p></nope>  ` && "Invalid tags
    `<ul>   <li>abc` && "Missing closing li tag
    `        <li>def     </li>` && "White spaces
    `<li>ghi   ` && "Missing closing li tag
    `</u>   ` && "Wrong closing ul tag
    `<style> p {color:green;}</style>` && "style tag not in the HTML document's head tag
    ` </body>  ` &&
    `           `. "Missing </html> tag

    "Converting string -> xstring for the importing parameter of the repair method
    TRY.
        DATA(html_as_xstring) = cl_abap_conv_codepage=>create_out( codepage = `UTF-8` )->convert( html ).
      CATCH cx_sy_conversion_codepage INTO DATA(conversion_error).
        out->write( conversion_error->get_text( ) ).
        RETURN.
    ENDTRY.

    "Repairing and cleaning up HTML code
    htmltidy->repair(
      EXPORTING
        input              = html_as_xstring
        diagnostics        = 'X'
      IMPORTING
        output             = DATA(output)
        retcode            = DATA(retcode)
        errors             = DATA(errors)
        tidy_status        = DATA(tidy_status)
        html_version       = DATA(html_version)
        num_error          = DATA(num_error)
        num_warning        = DATA(num_warning)
        num_access_warning = DATA(num_access_warning)
        num_config_error   = DATA(num_config_error) ).

    out->write( |***************** Results of repairing and cleaning up HTML document *****************\n| ).
    out->write( |retcode: { retcode }| ).
    out->write( |tidy_status: { tidy_status }| ).
    out->write( |html_version: { html_version }| ).
    out->write( |num_error: { num_error }| ).
    out->write( |num_warning: { num_warning }| ).
    out->write( |num_access_warning: { num_access_warning }| ).
    out->write( |num_config_error: { num_config_error }| ).
    out->write( |\n\n\n| ).

    htmltidy->errtab(
      EXPORTING
        msgstr = errors
      IMPORTING
        msgtab = DATA(errtab) ).

    IF errtab IS NOT INITIAL.
      out->write( `Error table:` ).
      out->write( errtab ).
      out->write( |\n\n| ).
    ENDIF.

    "Converting the result (xstring -> string)
    DATA(html_output) = cl_abap_conv_codepage=>create_in( )->convert( output ).
    out->write( |output:\n| ).
    out->write( html_output ).

**********************************************************************

   out->write( |******************************** Repairing and cleaning up an XML document ********************************\n| ).

    "Demo XML
    DATA(xml) = cl_abap_conv_codepage=>create_out( )->convert(
          `    <node attr_a="123">    <subnode1> <hallo>hi              </hallo>` &&
          `</subnode1> <subnode2> <letter>a</letter> <date format="mm-dd-yyyy">01-01-2025</date>` &&
          `</subnode2>` &&
          `      <subnode3>`  &&
          `        <text             attr_b="1"               attr_c="a">abc                </text>` &&
          `    <text     attr_b="2" attr_c="b">def</text>` &&
          `<text attr_b="3"           attr_c="c">   ghi  </text>` &&
          `   <text attr_b="4" attr_c="d">jkl   </text>` &&
          `   </subnode3>` &&
          `</node>                ` ).

    DATA(format_xml) = cl_htmltidy=>create( ).
    "Resetting all option settings to default values
    format_xml->reset_options( IMPORTING success = success ).

    IF success IS INITIAL.
      out->write( `Resetting all option settings to default values not successful.` ).
    ENDIF.

    "Setting options explicitly
    "The following code demonstrates exemplary option settings, including settings
    "particularly for XML documents.

    "Using XML parser
    format_xml->set_option( EXPORTING option  = 'input-xml'
                                      value   = 'yes'
                            IMPORTING success = success ).

    is_successful( option = `input-xml` out = out success = success ).

    "Writing well-formed XML
    format_xml->set_option( EXPORTING option  = 'output-xml'
                                      value   = 'yes'
                            IMPORTING success = success ).

    is_successful( option = `output-xml` out = out success = success ).

    "Adding XML declaration
    format_xml->set_option( EXPORTING option  = 'add-xml-decl'
                                      value   = 'yes'
                            IMPORTING success = success ).

    is_successful( option = `add-xml-decl` out = out success = success ).

    format_xml->set_option( EXPORTING option  = 'indent'
                                      value   = 'auto'
                            IMPORTING success = success ).

    is_successful( option = `indent` out = out success = success ).

    format_xml->repair(
       EXPORTING
         input              = xml
         diagnostics        = 'X'
       IMPORTING
         output             = DATA(xml_output)
         retcode            = DATA(xml_retcode)
         errors             = DATA(xml_errors)
         tidy_status        = DATA(xml_tidy_status)
         num_error          = DATA(xml_num_error)
         num_warning        = DATA(xml_num_warning)
         num_access_warning = DATA(xml_num_access_warning)
         num_config_error   = DATA(xml_num_config_error) ).

    out->write( |xml_retcode: { xml_retcode }| ).
    out->write( |xml_tidy_status: { xml_tidy_status }| ).
    out->write( |xml_num_error: { xml_num_error }| ).
    out->write( |xml_num_warning: { xml_num_warning }| ).
    out->write( |xml_num_access_warning: { xml_num_access_warning }| ).
    out->write( |xml_num_config_error: { xml_num_config_error }| ).
    out->write( |\n\n| ).

    format_xml->errtab(
      EXPORTING
        msgstr = xml_errors
      IMPORTING
        msgtab = errtab ).

    IF errtab IS NOT INITIAL.
      out->write( `Error table:` ).
      out->write( errtab ).
      out->write( |\n\n| ).
    ENDIF.

    out->write( |output:\n| ).

    DATA(formatted_xml_output) = cl_abap_conv_codepage=>create_in( )->convert( xml_output ).
    out->write( formatted_xml_output ).

  ENDMETHOD.

  METHOD is_successful.
    IF success IS INITIAL.
      out->write( |Option setting for "{ option }" not successful.| ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.
``` 

</details>  

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
