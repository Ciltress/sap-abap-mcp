# Strings, codepages and regular expressions

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- String Processing
- Handling Codepages and Binary Data
- Regular Expressions

---

## String Processing 

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>

<tr>
<td> <code>CL_ABAP_CHAR_UTILITIES</code> </td>
<td> 
Provides utilities for string processing, such as attributes that represent new lines and horizontal tabs.
<br><br>

``` abap
DATA(tabbed) = `#` && cl_abap_char_utilities=>horizontal_tab && `#`.

"The following attributes can be replaced by a representation of
"the control characters in a string template.
ASSERT cl_abap_char_utilities=>newline        = |\n|.
ASSERT cl_abap_char_utilities=>horizontal_tab = |\t|.
ASSERT cl_abap_char_utilities=>cr_lf          = |\r\n|.
``` 

</td>
</tr>
<tr>
<td> <code>CL_ABAP_STRING_UTILITIES</code> </td>
<td> 
For processing text strings, such as handling trailing blanks in character strings (i.e. data objects of type <code>string</code>).
<br><br>

``` abap
DATA(string) = `ABAP   `.
"Removing trailing blanks
cl_abap_string_utilities=>del_trailing_blanks( CHANGING str = string ).
"`ABAP`

"Preserving trailing blanks when assigning text fields to data objects of
"type string
DATA(chars) = 'ABAP   '.
cl_abap_string_utilities=>c2str_preserving_blanks( EXPORTING source = chars 
                                                   IMPORTING dest   = DATA(str_w_blanks) ).
"`ABAP   `

DATA(str_no_blanks) = CONV string( chars ).
"`ABAP`
``` 

</td>
</tr>

<tr>
<td> <code>XCO_CP</code> </td>
<td> 
Offers various options to process strings using the XCO Library; see a selection in the code snippet
<br><br>

``` abap
"--------- Extracting a substring from a string ---------
DATA(some_string) = `abcdefghijklmnopqrstuvwxyz`.

"Creating an encapsulation of a string using XCO
DATA(str) = xco_cp=>string( some_string ).

"Using the FROM and TO methods, you can determine
"the character position. Note that the value includes the
"character at the position specified.
"The character index pattern for the example string above
"is (the string has 26 characters in total):
"a = 1, b = 2, c = 3 ... z = 26
"a = -26, b = -25, c = -24 ... z = -1
"Providing a value that is out of bounds means that
"the first (or the last) character of the string is used
"by default.
"Note: When combining FROM and TO, e.g. with method
"chaining ...->from( ...)->to( ... ), note that another
"instance is created with the first 'from', and another
"character index pattern is created based on the new
"and adjusted string value.

"bcdefghijklmnopqrstuvwxyz
DATA(sub1) = str->from( 2 )->value.

"defghijklmnopqrstuvwxyz
DATA(sub2) = str->from( -23 )->value.

"vwxyz
DATA(sub3) = str->from( -5 )->value.

"abcde
DATA(sub4) = str->to( 5 )->value.

"ab
DATA(sub5) = str->to( -25 )->value.

"Result of 1st 'from' method call: bcdefghijklmnopqrstuvwxyz
"Based on this result, the 'to' method call is
"applied.
"bcdefg
DATA(sub6) = str->from( 2 )->to( 6 )->value.

"Result of 1st 'to' method call: abcdefghijklmnopq
"Based on this result, the 'from' method call is
"applied.
"defghijklmnopq
DATA(sub7) = str->to( -10 )->from( 4 )->value.

"Values that are out of bounds.
"In the example, the first and last character of the
"string are used.
"abcdefghijklmnopqrstuvwxyz
DATA(sub8) = str->from( 0 )->to( 100 )->value.

"--------- Splitting and joining ---------

"Splitting a string into a string table
DATA(str_table) = xco_cp=>string( `Hello.World.ABAP` )->split( `.` )->value.
"Hello
"World
"ABAP

"Concatenating a string table into a string; specifying a delimiter
str_table = VALUE #( ( `a` ) ( `b` ) ( `c` ) ).
"a, b, c
DATA(conc_str1) = xco_cp=>strings( str_table )->join( `, ` )->value.

"Concatenating a string table into a string; specifying a delimiter and
"reversing the table order
"c / b / a
DATA(conc_str2) = xco_cp=>strings( str_table )->reverse( )->join( ` / ` )->value.

"--------- Prepending and appending strings ---------
DATA(name) = xco_cp=>string( `Max Mustermann` ).

"Max Mustermann, Some Street 1, 12345 Someplace
DATA(address) = name->append( `, Some Street 1, 12345 Someplace` )->value.

"Mr. Max Mustermann
DATA(title) = name->prepend( `Mr. ` )->value.

"--------- Transforming to lowercase and uppercase ---------
"ABAP
DATA(to_upper) = xco_cp=>string( `abap` )->to_upper_case( )->value.

"hallo world
DATA(to_lower) = xco_cp=>string( `HALLO WORLD` )->to_lower_case( )->value.

"--------- Checking if a string starts/ends with a specific string ---------
DATA check TYPE string.
DATA(str_check) = xco_cp=>string( `Max Mustermann` ).

"yes
IF str_check->ends_with( `mann` ).
  check = `yes`.
ELSE.
  check = `no`.
ENDIF.

"no
IF str_check->starts_with( `John` ).
  check = `yes`.
ELSE.
  check = `no`.
ENDIF.

"--------- Matching string against regular expression ---------
DATA match TYPE string.

"yes
IF xco_cp=>string( ` 1` )->matches( `\s\d` ).
  match = `yes`.
ELSE.
  match = `no`.
ENDIF.

"no
IF xco_cp=>string( ` X` )->matches( `\s\d` ).
  match = `yes`.
ELSE.
  match = `no`.
ENDIF.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Handling Codepages and Binary Data 

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_GZIP*</code> </td>
<td>
(De)compressing character strings and byte strings using GZIP: 
<code>CL_ABAP_GZIP</code>, 
<code>CL_ABAP_GZIP_BINARY_STREAM</code>,
<code>CL_ABAP_GZIP_TEXT_STREAM</code>,
<code>CL_ABAP_UNGZIP_BINARY_STREAM</code>,
<code>CL_ABAP_UNGZIP_TEXT_STREAM</code>
<br><br>

``` abap
"------- (De)compressing binary data -------
DATA(str) = `This is a data object of type string. It should be converted to xstring, compressed and decompressed.`.
DATA(xstr) = cl_abap_conv_codepage=>create_out( )->convert( str ).
DATA xstr_comp TYPE xstring.

"Compressing binary data
TRY.
    cl_abap_gzip=>compress_binary( EXPORTING raw_in   = xstr
                                   IMPORTING gzip_out = xstr_comp ).
  CATCH cx_parameter_invalid_range cx_sy_buffer_overflow cx_sy_compression_error.
ENDTRY.

"Comparing the length of the data objects
DATA(len_xstr) = xstrlen( xstr ). "101
DATA(len_xstr_comp) = xstrlen( xstr_comp ). "81

"Decompressing binary data
DATA xstr_decomp TYPE xstring.
TRY.
    cl_abap_gzip=>decompress_binary( EXPORTING gzip_in = xstr_comp
                                     IMPORTING raw_out = xstr_decomp ).
  CATCH cx_parameter_invalid_range cx_sy_buffer_overflow cx_sy_compression_error.
ENDTRY.

DATA(len_xstr_decomp) = xstrlen( xstr_decomp ). "101
DATA(conv_str) = cl_abap_conv_codepage=>create_in( )->convert( xstr_decomp ).

"abap_true
DATA(is_equal) = xsdbool( len_xstr = len_xstr_decomp AND str = conv_str ). 

"------- (De)compressing character strings -------
DATA zipped TYPE xstring.
TRY.
    cl_abap_gzip=>compress_text( EXPORTING text_in  = `Hello world`
                                 IMPORTING gzip_out = zipped ).
  CATCH cx_parameter_invalid_range cx_sy_buffer_overflow cx_sy_conversion_codepage cx_sy_compression_error.
ENDTRY.

DATA txt TYPE string.
TRY.
    cl_abap_gzip=>decompress_text( EXPORTING gzip_in  = zipped
                                   IMPORTING text_out = txt ).
  CATCH cx_parameter_invalid_range cx_sy_buffer_overflow cx_sy_conversion_codepage cx_sy_compression_error.
ENDTRY.

ASSERT txt = `Hello world`.
``` 

</td>
</tr>


<tr>
<td> <code>CL_ABAP_CONV_CODEPAGE</code> </td>
<td> 
For handling code pages, converting strings to the binary representation of different code pages and vice versa. 
<br><br>

``` abap
DATA(hi) = `Hello world`.

"string -> xstring
"Note: UTF-8 is used by default. Here, it is specified explicitly.
TRY.
    DATA(conv_xstring) = cl_abap_conv_codepage=>create_out( codepage = `UTF-8` )->convert( hi ).
  CATCH cx_sy_conversion_codepage.
ENDTRY.
"48656C6C6F20776F726C64

"xstring -> string
DATA(conv_string) = cl_abap_conv_codepage=>create_in( )->convert( conv_xstring ).
"Hello world
``` 

</td>
</tr>
<tr>
<td> <code>XCO_CP</code> </td>
<td> 
Converting strings to xstrings using a codepage using the XCO Library
<br><br>

``` abap
"536F6D6520737472696E67
DATA(xstr) = xco_cp=>string( `Some string` )->as_xstring( xco_cp_character=>code_page->utf_8 )->value.

"Some string
DATA(str) = xco_cp=>xstring( xstr )->as_string( xco_cp_character=>code_page->utf_8 )->value.
``` 

</td>
</tr>

<tr>
<td> <code>XCO_CP</code> </td>
<td> 
Base64 decoding/encoding using XCO
<br><br>

``` abap
DATA(a_string) = `Hello world`.
"string -> xstring
"Result: 48656C6C6F20776F726C64
DATA(conv_xstring) = xco_cp=>string( a_string
  )->as_xstring( xco_cp_character=>code_page->utf_8
  )->value.
"Encoding of raw binary data into its Base64 representation
"Result: SGVsbG8gd29ybGQ=
DATA(raw2base64) = xco_cp=>xstring( conv_xstring
  )->as_string( xco_cp_binary=>text_encoding->base64
  )->value.
"Decoding of a Base64 representation into raw binary data
"Result: 48656C6C6F20776F726C64
DATA(base642raw) = xco_cp=>string( raw2base64
  )->as_xstring( xco_cp_binary=>text_encoding->base64
  )->value.
"xstring -> string
"Result: Hello world
DATA(conv_string_xco) = xco_cp=>xstring( base642raw
  )->as_string( xco_cp_character=>code_page->utf_8
  )->value.
``` 

</td>
</tr>

<tr>
<td> <code>CL_WEB_HTTP_UTILITY</code> </td>
<td> 
Endcoding strings/xstrings in Base64 and decoding Base64-encoded strings/xstrings
<br><br>

``` abap
DATA(hi) = `Hello world`.

"Encoding a string in BASE64
"Result is of type string
"SGVsbG8gd29ybGQ=
DATA(encode_base64_str) = cl_web_http_utility=>encode_base64( unencoded = hi ).

"Decoding a base64-encoded String
"Result is of type string
"Hello world
DATA(decode_base64_str) = cl_web_http_utility=>decode_base64( encoded = encode_base64_str ).

**********************************************************************

"string -> xstring
"48656C6C6F20776F726C64
DATA(conv_xstring) = cl_abap_conv_codepage=>create_out( codepage = `UTF-8` )->convert( hi ).

"Encoding an xstring in BASE64
"Result is of type string
"SGVsbG8gd29ybGQ=
DATA(encode_base64_xstr) = cl_web_http_utility=>encode_x_base64( unencoded = conv_xstring ).

"Decoding a base64-encoded xstring
"48656C6C6F20776F726C64
DATA(decode_base64_xstr) = cl_web_http_utility=>decode_x_base64( encoded = encode_base64_xstr ).

"xstring -> string
"Hello world
DATA(conv_string) = cl_abap_conv_codepage=>create_in( )->convert( decode_base64_xstr ).
``` 

</td>
</tr>

</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Regular Expressions 

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<td> <code>CL_ABAP_REGEX</code> <br> <code>CL_ABAP_MATCHER</code> </td>
<td> 
<ul>
<li>For an object-oriented representation of regular expressions.</li>
<li>For example, the <code>CREATE_PCRE</code> method creates instances of regular expressions with PCRE syntax.</li>
<li>The instances can be used, for example, with the <code>CL_ABAP_MATCHER</code> class, which applies the regular expressions.</li>
<li>A variety of methods and parameters can be specified to accomplish various things and to further specify the handling of the regular expression.</li>
</ul>
<br>

``` abap
"Example string
DATA(str) = `a1 # B2 ? cd . E3`.

"----------- Creating an instance of a regular expression -----------

"Creating an instance of a regular expression with PCRE syntax
"using cl_abap_regex

"Example pattern: Any-non digit followed by a digit
DATA(regex) = cl_abap_regex=>create_pcre( pattern = `\D\d`
                                          ignore_case = abap_true ).

"----------- Creating matchers -----------

"Two ways are possible (both ways return references of type
"ref to cl_abap_matcher):
"- create_matcher method of the cl_abap_regex class
"- create_pcre method of the cl_abap_matcher class
"Note that several importing parameters are available to enable
"further settings of the regular expression, e.g. ignoring the
"case, using the extended mode, etc. The example pass a string
"to the 'text' parameter. You can also specify internal tables
"with the 'table' parameter and more.

"Creating a matcher using the create_matcher method of the cl_abap_regex class
DATA(matcher_1) = regex->create_matcher( text = str ).
"Creating a matcher in one go using method chaining
DATA(matcher_2) = cl_abap_regex=>create_pcre( pattern = `\D\d`
                                              ignore_case = abap_true
                                            )->create_matcher( text = str ).

"Creating a matcher using the create_pcre method of the cl_abap_matcher class
DATA(matcher_3) = cl_abap_matcher=>create_pcre( pattern = `\D\d`
                                                text    = str
                                                ignore_case = abap_true ).

"----------- Exploring searching and replacing -----------

"--- Finding all occurrences using the find_all method ---
"In the example, result has the type match_result_tab containing the findings.
DATA(result_fa1) = matcher_1->find_all( ).

*LINE    OFFSET    LENGTH    SUBMATCHES
*0       0         2         OFFSET     LENGTH
*
*0       5         2         OFFSET     LENGTH
*
*0       15        2         OFFSET     LENGTH

DATA(result_fa2) = matcher_2->find_all( ).
ASSERT result_fa2 = result_fa1.

"Getting the result in one go using method chaining with cl_abap_matcher
DATA(result_fa3) = cl_abap_matcher=>create_pcre( pattern = `\D\d`
                                                text    = str
                                                ignore_case = abap_true
                                              )->find_all( ).
ASSERT result_fa3 = result_fa1.

"--- Example with submatches ---

str = `XabcdXXefgXXhXXijklmnXX`.

DATA(result_fa4) = cl_abap_matcher=>create_pcre( pattern = `X(.*?)X`
                                                 text    = str
                                                 ignore_case = abap_true
                                               )->find_all( ).

*LINE    OFFSET    LENGTH    SUBMATCHES
*0       0         6         OFFSET    LENGTH
*                            1         4
*0       6         5         OFFSET    LENGTH
*                            7         3
*0       11        3         OFFSET    LENGTH
*                            12        1
*0       14        8         OFFSET    LENGTH
*                            15        6

"--- Replacing all occurrences using the 'replace_all' method ---

DATA(matcher_repl_1) = cl_abap_regex=>create_pcre( pattern = `X(.*?)X`
                                                 )->create_matcher( text = str ).

"4
DATA(repl_count_1) = matcher_repl_1->replace_all( newtext = `#$1#` ).

"#abcd##efg##h##ijklmn#X
DATA(repl_result_1) = matcher_repl_1->text.

"Using cl_abap_matcher
DATA(matcher_repl_2) = cl_abap_matcher=>create_pcre( pattern = `X(.*?)X`
                                                     text    = str ).
DATA(repl_count_2) = matcher_repl_2->replace_all( newtext = `#$1#` ).
DATA(repl_result_2) = matcher_repl_2->text.

"---- Sequential processing of the regular expression ---
"---- using the find_next method ------------------------
"The example explores various other methods, and writes
"information to a string table.

str = `a1bc2def3ghij45klm67opqr8stuvwx90yz`.

DATA(matcher_fn) = cl_abap_matcher=>create_pcre( pattern = `\d(\D.)`
                                                 text    = str ).

DATA strtab TYPE string_table.
WHILE matcher_fn->find_next( ) = abap_true.
  APPEND |---- Finding { sy-index } -----| TO strtab.

  "Type match_result
  DATA(match_result) = matcher_fn->get_match( ).

  DATA(offset) = matcher_fn->get_offset( ).
  DATA(length) = matcher_fn->get_length( ).
  DATA(matched_content) = str+offset(length).

  APPEND |Match offset: { offset }| TO strtab.
  APPEND |Match length: { length }| TO strtab.
  APPEND |Match content: { matched_content }| TO strtab.

  "Type match_result
  DATA(subgroup) = matcher_fn->get_match( )-submatches.

  LOOP AT subgroup INTO DATA(wa).
    DATA(sub_tabix) = sy-tabix.
    DATA(submatch_line) = wa.
    DATA(submatch_offset) = wa-offset.
    DATA(submatch_length) = wa-length.
    DATA(submatch) = matcher_fn->get_submatch( sub_tabix ).
    APPEND |Submatch { sub_tabix } offset: { submatch_offset }| TO strtab.
    APPEND |Submatch { sub_tabix } length: { submatch_length }| TO strtab.
    APPEND |Submatch { sub_tabix } content: { submatch }| TO strtab.
  ENDLOOP.

ENDWHILE.

"---- Using an object of type cl_abap_regex in ABAP ---
"---- statements with the REGEX addition --------------

DATA(result_find_all_1) = cl_abap_matcher=>create_pcre( pattern = `\d(\D.)`
                                                        text = str
                                                      )->find_all( ).
DATA(result_find_all_2) = cl_abap_regex=>create_pcre( pattern = `\d(\D.)`
                                           )->create_matcher( text = str
                                           )->find_all( ).

DATA(reg_expr) = cl_abap_regex=>create_pcre( pattern = `\d(\D.)` ).

FIND ALL OCCURRENCES OF REGEX reg_expr IN str RESULTS DATA(result_find_all_3).

*LINE    OFFSET    LENGTH    SUBMATCHES
*0       1         3         OFFSET    LENGTH
*                            2         2
*0       4         3         OFFSET    LENGTH
*                            5         2
*0       8         3         OFFSET    LENGTH
*                            9         2
*0       14        3         OFFSET    LENGTH
*                            15        2
*0       19        3         OFFSET    LENGTH
*                            20        2
*0       24        3         OFFSET    LENGTH
*                            25        2
*0       32        3         OFFSET    LENGTH
*                            33        2

ASSERT result_find_all_3 = result_find_all_1.
ASSERT result_find_all_3 = result_find_all_2.

"Note that the REGEX addition is obsolete when using (POSIX) syntax patterns
"A syntax warning is displayed for the following example.
"FIND ALL OCCURRENCES OF REGEX `\d(\D.)` IN str RESULTS DATA(result_8).

"The syntax warning can be suppressed using a pragma
FIND ALL OCCURRENCES OF REGEX `\d(\D.)` IN str RESULTS DATA(result_find_all_4) ##REGEX_POSIX.

"Using PCRE instead
FIND ALL OCCURRENCES OF PCRE `\d(\D.)` IN str RESULTS DATA(result_find_all_5).
ASSERT result_find_all_5 = result_find_all_3.

"---------------- Exploring more parameters of the create_pcre method ----------------
"See the class documentation for more parameters and information.

"--- enable_multiline parameter ---

str = |abc\ndef\nghi\njkl|.

DATA(matcher_no_ml) = cl_abap_matcher=>create_pcre( pattern = `^`
                                                    text    = str ).
"1
DATA(repl_count_no_ml) = matcher_no_ml->replace_all( newtext = `#` ).
"|#abc\ndef\nghi\njkl|
DATA(repl_result_no_ml) = matcher_no_ml->text.

DATA(matcher_w_ml) = cl_abap_matcher=>create_pcre( pattern = `^`
                                                   text    = str
                                                   enable_multiline = abap_true ).
"4
DATA(repl_count_w_ml) = matcher_w_ml->replace_all( newtext = `#` ).
"|#abc\n#def\n#ghi\n#jkl|
DATA(repl_result_w_ml) = matcher_w_ml->text.

"--- table/ignore_case parameters ---

data(str_table) = VALUE string_table( ( `abZdez` ) ( `zZfghZ` ) ( `ijkZZz` ) ( `zzzzZ` ) ).

DATA(matcher_tab) = cl_abap_matcher=>create_pcre( pattern = `z+`
                                                  table   = str_table
                                                  ignore_case = abap_true ).
"6
DATA(repl_count_tab) = matcher_tab->replace_all( newtext = `#` ).
"ab#de# / #fgh# / ijk# / #
DATA(repl_result_tab) = matcher_tab->table.

"--- extended parameter ---

str = `abc def`.

DATA(matcher_w_extended) = cl_abap_matcher=>create_pcre( pattern = `abc def`
                                                         text    = str ).

"No replacement in the following example as the extended mode is
"enabled by default.
"0
DATA(repl_count_w_extended) = matcher_w_extended->replace_all( newtext = `#` ).
"abc def
DATA(repl_result_w_extended) = matcher_w_extended->text.

"Disabling the extended mode so that whitespaces are not ignored
DATA(matcher_not_extended) = cl_abap_matcher=>create_pcre( pattern = `abc def`
                                                           text    = str
                                                           extended = abap_false ).

"1
DATA(repl_count_not_extended) = matcher_not_extended->replace_all( newtext = `#` ).
"#
DATA(repl_result_not_extended) = matcher_not_extended->text.
```

</td>
</tr>

</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
