# Numbers and calculations

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Numbers and Calculations

---

## Numbers and Calculations

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_MATH</code> </td>
<td>
For operations with (decimal) floating point numbers and for providing constants for minimum and maximum values.
<br><br>

``` abap
"Constants for the minimum and maximum values of built-in numeric types
"Example: Type i
DATA(min_int4) = cl_abap_math=>min_int4. "-2147483648  
DATA(max_int4) = cl_abap_math=>max_int4. "2147483647 

"Rounding binary floating point number to 15 places using commercial rounding
DATA flpnum TYPE f VALUE '1.005'.
DATA(rd) = cl_abap_math=>round_f_to_15_decs( flpnum ). "1.005000000000001E0
DATA(str2dcm) = |{ flpnum DECIMALS = 2 }|. "1.00
DATA(str2dcm_rd) = |{ cl_abap_math=>round_f_to_15_decs( flpnum ) DECIMALS = 2 }|. "1.01

"Properties of decimal floating point numbers
"Example: 98.765; an integer with fixed precision, i.e. a given length (the length of 98765),
"which is scaled by dividing through a power of 10 (10 powered by n, representing
"the number of decimal places; in the example, the scaling is the negative exponent)
DATA(decf) = CONV decfloat34( '98.765' ).
DATA(scale) = cl_abap_math=>get_scale( decf ). "3
DATA(precision) = cl_abap_math=>get_number_of_digits( decf ). "5
``` 

</td>
</tr>
<tr>
<td> <code>CL_ABAP_DECFLOAT</code> </td>
<td>
For handling decimal floating point numbers.
<br><br>

``` abap
"Converting currency amounts to decimal floating point numbers using a
"a currency key. The reverse is also possible.
DATA(dec) = CONV decfloat34( '12340'
                             "'123.456'
                            ).
DATA pdec TYPE p LENGTH 9 DECIMALS 2.
cl_abap_decfloat=>convert_decfloat_to_curr( EXPORTING amount_decfloat = dec
                                                      cuky            = 'EUR'
                                            IMPORTING amount_curr = pdec ) .
"12340.0
"123.46

"Converting strings to decimal floating point numbers
"The character string is converted to a value of type decfloat34,
"which is passed back in VALUE.
DATA dcfl34 TYPE decfloat34.
DATA return_code TYPE i.
DATA str TYPE string VALUE `1234.8652`.
TRY.
    cl_abap_decfloat=>read_decfloat34( EXPORTING string = str
                                        IMPORTING value  = dcfl34
                                                  rc     = return_code ).
    CATCH cx_sy_conversion_overflow cx_abap_decfloat_invalid_char cx_abap_decfloat_parse_err.
ENDTRY.
``` 

</td>
</tr>
<tr>
<td> <code>CL_ABAP_BIGINT</code> </td>
<td>
For calculations with integers of any size (e.g. to avoid the risk of an arithmetic overflow). Find more information in
<a href="https://blogs.sap.com/2023/08/09/new-classes-for-arbitrary-precision-arithmetic-in-abap/">this blog</a>, and check out the different methods available.
<br><br>

``` abap
"Factories
DATA(bigint_int4) = cl_abap_bigint=>factory_from_int4( 10 ).
DATA(bigint_int4c) = cl_abap_bigint=>factory_from_string( `283469208407283452340` ).
DATA(bigint_int4d) = cl_abap_bigint=>factory_from_int8( CONV int8( 1234567890123456 ) ).

DATA(a1) = cl_abap_bigint=>factory_from_int4( -10 )->to_external( ).
DATA(a2) = cl_abap_bigint=>factory_from_int4( -10 )->to_external( iv_flg_minus_in_front = abap_true ).
DATA(a3) = cl_abap_bigint=>factory_from_int4( 100 )->to_utf8( ).
DATA(a4) = cl_abap_bigint=>factory_from_string( `123` )->to_df34( ).
DATA(a5) = cl_abap_bigint=>factory_from_int4( -10 )->to_string( ).
DATA(a6) = cl_abap_bigint=>factory_from_int4( 4 )->add( bigint_int4 )->to_string( ).
DATA(a7) = cl_abap_bigint=>factory_from_int4( 7 )->add_int4( 2 )->to_string( ).
DATA(a8) = cl_abap_bigint=>factory_from_int4( -10 )->abs( )->to_string( ).
DATA(a9) = cl_abap_bigint=>factory_from_int4( 19 )->compare_int4( 20 ).
DATA(a10) = cl_abap_bigint=>factory_from_int4( 100 )->compare( bigint_int4 ).
DATA(a11) = cl_abap_bigint=>factory_from_int4( 20 )->div( bigint_int4 ).
DATA(a12) = a11-quotient->to_string( ).
DATA(a13) = a11-remainder->to_string( ).
DATA(a14) = cl_abap_bigint=>factory_from_int4( 10 )->div_int4( 3 ).
DATA(a15) = a14-quotient->to_string( ).
DATA(a16) = a14-remainder.
DATA(a17) = cl_abap_bigint=>factory_from_int4( 10 )->div_by_two_power( CONV int8( 2 ) )->to_string( ).
DATA(a18) = cl_abap_bigint=>factory_from_int4( 5 )->div_to_df34( bigint_int4 ).
DATA(a19) = cl_abap_bigint=>factory_from_int4( 50 )->gcd( bigint_int4 )->to_string( ).
DATA(a20) = cl_abap_bigint=>factory_from_int4( 1000 )->get_number_of_bits( ).
DATA(a21) = cl_abap_bigint=>factory_from_int4( 10 )->is_equal( bigint_int4 ).

cl_abap_bigint=>factory_from_string( `123` )->is_int4(
  IMPORTING
    ev_int4_value  = DATA(a22)
  RECEIVING
    rv_flg_is_int4 = DATA(a23)
).
DATA(a24) = cl_abap_bigint=>factory_from_int4( 11 )->is_larger( bigint_int4 ).
DATA(a25) = cl_abap_bigint=>factory_from_int4( 10 )->is_larger_or_equal( bigint_int4 ).
DATA(a26) = cl_abap_bigint=>factory_from_int4( -10 )->is_negative( ).
DATA(a27) = cl_abap_bigint=>factory_from_int4( 0 )->is_zero( ).
DATA(a28) = cl_abap_bigint=>factory_from_int4( 123 )->mod( bigint_int4 )->to_string( ).
DATA(a29) = cl_abap_bigint=>factory_from_int4( 10 )->mod_int4( 3 ).
DATA(a30) = cl_abap_bigint=>factory_from_int4( 10 )->mul( bigint_int4 )->to_string( ).
DATA(a31) = cl_abap_bigint=>factory_from_int4( 5 )->mul_by_two_power( 2 )->to_string( ).
DATA(a32) = cl_abap_bigint=>factory_from_int4( 2 )->mul_int4( 5 )->to_string( ).
DATA(a33) = cl_abap_bigint=>factory_from_int4( 8 )->pow( 2 )->to_string( ).
DATA(a34) = cl_abap_bigint=>factory_from_int4( 9 )->sqrt( )->to_string( ).
DATA(a35) = cl_abap_bigint=>factory_from_int4( 18 )->sub( bigint_int4 )->to_string( ).
DATA(a36) = cl_abap_bigint=>factory_from_int4( 15 )->sub_int4( 9 )->to_string( ).
"Cloning
DATA(a37) = cl_abap_bigint=>factory_from_int4( 15 ).
DATA(a38) = cl_abap_bigint=>factory_from_int4( 5 ).
"Adding a number to another number to not get a new instance but the original instance
DATA(a39) = a37->add( a38 ).
ASSERT a39 = a37.
DATA(a40) = a37->to_string( ).
DATA(a41) = a39->to_string( ).
DATA(a42) = cl_abap_bigint=>factory_from_int4( 15 ).
DATA(a43) = cl_abap_bigint=>factory_from_int4( 5 ).

DATA(a44) = a42->clone( )->add( a43 ).
ASSERT a44 <> a42.
DATA(a45) = a42->to_string( ).
DATA(a46) = a44->to_string( ).
DATA(a47) = cl_abap_bigint=>factory_from_int4( 15 )->sub_int4( 9 )->clone( )->to_string( ).
``` 

</td>
</tr>
<tr>
<td> <code>CL_ABAP_RATIONAL</code> </td>
<td>
For calculations with rational numbers without precision loss and rounding errors.
<br><br>

``` abap
"Creating a rational number from a string
DATA(rat_num) = cl_abap_rational=>factory_from_string( `-1/3` ).

"Performing an addition and converting the result to string
"7/6
DATA(addition_res) = rat_num->add( cl_abap_rational=>factory_from_string( `3/2` ) )->to_string( ). 

"Factories
DATA(r1) = cl_abap_rational=>factory_from_string( `-1/3` ).
DATA(r2) = cl_abap_rational=>factory_from_bigint( cl_abap_bigint=>factory_from_int4( 11 ) ).

TYPES p_l16d5 TYPE p LENGTH 16 DECIMALS 5.
DATA(r3) = cl_abap_rational=>factory_from_dec( CONV p_l16d5( '123456.789' ) ).
DATA(r4) = cl_abap_rational=>factory_from_decimal_string( `1.234567890` ).
DATA(r5) = cl_abap_rational=>factory_from_df34( `1.4` ).
DATA(r6) = cl_abap_rational=>factory_from_int4( 100 ).
DATA(r7) = cl_abap_rational=>factory_from_int8( CONV int8( 123 ) ).
DATA(r8) = cl_abap_rational=>factory_from_string( `-2/3` )->add_int4( 1 )->to_df34( ).
DATA(r9) = cl_abap_rational=>factory_from_string( `-2/3` )->add_int4( 1 )->to_string( ).
DATA r10 TYPE p_l16d5.
cl_abap_rational=>factory_from_string( `-2/3` )->add_int4( 1 )->to_dec( IMPORTING ev_decimal = r10 ).
"Methods that include cl_abap_bigint instances
DATA(r11) = cl_abap_rational=>factory_from_string( `-2/3` )->add_bigint( cl_abap_bigint=>factory_from_int4( 1 ) )->to_string( ).
``` 

</td>
</tr>
<td> <code>CL_ABAP_RANDOM*</code> </td>
<td>
For generating arbitrary numbers for different numeric types: 
<code>CL_ABAP_RANDOM_INT</code> (type <code>i</code>), 
<code>CL_ABAP_RANDOM_INT8</code> (<code>int8</code>), 
<code>CL_ABAP_RANDOM_FLOAT</code> (<code>f</code>),
<code>CL_ABAP_RANDOM_PACKED</code> (<code>p</code>),
<code>CL_ABAP_RANDOM_PACKED_DEC1</code> - <code>CL_ABAP_RANDOM_PACKED_DEC14</code> (<code>p</code> with 1 to 14 decimal places),
<code>CL_ABAP_RANDOM_DECFLOAT16</code> (<code>decfloat16</code>),
<code>CL_ABAP_RANDOM_DECFLOAT34</code> (<code>decfloat34</code>)
<br><br>

``` abap
"Getting multiple random integers that are to be stored in an 
"internal table of type i
TYPES int_tab_type TYPE TABLE OF i WITH EMPTY KEY.
DATA int_tab TYPE int_tab_type.

"The optional parameters are explicitly specified in the example;
"'seed' represents the initial starting number, you can use 
"'cl_abap_random=>seed( )' to specify an arbitrary start value
DATA(random_num1) = cl_abap_random_int=>create( seed = cl_abap_random=>seed( )
                                                min  = 1
                                                max  = 100 ).
DO 3 TIMES.
  APPEND random_num1->get_next( ) TO int_tab.
ENDDO.

"Getting a random integer in one go using method chaining
DATA(random_num2) = cl_abap_random_int=>create( seed = cl_abap_random=>seed( )
                                                min  = 100
                                                max  = 1000 )->get_next( ).
``` 

<br>

The following example explores the generation of arbitrary numeric values. 
- It uses dynamic programming techniques. Find more information in the [Dynamic Programming](06_Dynamic_Programming.md) cheat sheet.
- The class names are constructed dynamically. They all begin with `CL_ABAP_RANDOM_`.
- An object is created dynamically based on the constructed class name.
- This object is assigned the result of a dynamic method call. The error handling is included as the `min` and `max` parameters are not available for all methods.
- The `get_next` method returns an appropriately typed data object, e.g. in case of `CL_ABAP_RANDOM_DECFLOAT34`, a data object of type `decfloat34` is returned. As a generic returning parameter is not possible, the example uses a data object of type `string`. So, the value returned is converted to type `string`. Note that are special conversion rules (e.g. the minus character for negative values are added at the end by default).
- The resulting string values are added to an internal table for display purposes.
- The example also includes static method calls.


```abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.

    TYPES: BEGIN OF random_values,
             class        TYPE string,
             random_value TYPE string,
           END OF random_values.
    DATA random_value_table TYPE TABLE OF random_values WITH EMPTY KEY.

    DATA(cl_name_parts) = VALUE string_table( ( `DECFLOAT16` )
                                              ( `DECFLOAT34` )
                                              ( `FLOAT` )
                                              ( `INT` )
                                              ( `INT8` )
                                              ( `PACKED` )
                                              ( `PACKED_DEC` ) ).

    LOOP AT cl_name_parts INTO DATA(wa).

      IF wa CS `PACKED_DEC`.
        FIND PCRE `\d` IN wa.
        IF sy-subrc <> 0.
          DELETE cl_name_parts INDEX sy-tabix.
          DO 14 TIMES.
            APPEND wa && sy-index TO cl_name_parts.
          ENDDO.
          CONTINUE.
        ENDIF.
      ENDIF.

      DATA(cl_name) = `CL_ABAP_RANDOM_` && wa.
      DATA oref TYPE REF TO object.

      TRY.
          CALL METHOD (cl_name)=>create
            EXPORTING
              seed = cl_abap_random=>seed( )
              min  = 1
              max  = 1000
            RECEIVING
              prng = oref.
        CATCH cx_sy_dyn_call_param_not_found.
          CALL METHOD (cl_name)=>create
            EXPORTING
              seed = cl_abap_random=>seed( )
            RECEIVING
              prng = oref.
      ENDTRY.

      DATA value_conv2string TYPE string.

      CALL METHOD oref->('GET_NEXT') RECEIVING value = value_conv2string.

      APPEND VALUE #( class = cl_name random_value = value_conv2string ) TO random_value_table.
    ENDLOOP.

    out->write( random_value_table ).

    DATA(a) = cl_abap_random_decfloat16=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(b) = cl_abap_random_decfloat34=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(c) = cl_abap_random_float=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(d) = cl_abap_random_int=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(e) = cl_abap_random_int8=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(f) = cl_abap_random_packed=>create( seed = cl_abap_random=>seed( ) )->get_next( ).    
    DATA(g) = cl_abap_random_packed_dec1=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(h) = cl_abap_random_packed_dec2=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(i) = cl_abap_random_packed_dec3=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(j) = cl_abap_random_packed_dec4=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(k) = cl_abap_random_packed_dec5=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(l) = cl_abap_random_packed_dec6=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(m) = cl_abap_random_packed_dec7=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(n) = cl_abap_random_packed_dec8=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(o) = cl_abap_random_packed_dec9=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(p) = cl_abap_random_packed_dec10=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(q) = cl_abap_random_packed_dec11=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(r) = cl_abap_random_packed_dec12=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(s) = cl_abap_random_packed_dec13=>create( seed = cl_abap_random=>seed( ) )->get_next( ).
    DATA(t) = cl_abap_random_packed_dec14=>create( seed = cl_abap_random=>seed( ) )->get_next( ).

  ENDMETHOD.

ENDCLASS.
```

</td>
</tr>
<tr>
<td> <code>CL_ABAP_PROB_DISTRIBUTION</code><br><code>CL_ABAP_PROB_DISTRIBUTION_DF34</code> </td>
<td>

- For generating random numbers from various probability distributions and performing probability calculations. 
- `CL_ABAP_PROB_DISTRIBUTION` calculates with float probabilities, `CL_ABAP_PROB_DISTRIBUTION_DF34` with decfloat34 probabilities.
- For more information, refer to the class documentation and [this blog](https://community.sap.com/t5/technology-blog-posts-by-sap/random-numbers-and-probability-distributions-in-the-abap-environments-for/ba-p/14173266).

<br>

``` abap
"The following code snippet shows the generation of many random numbers in one go.
"20 random numbers in the value range 1 - 100 are created.
DATA(random) = cl_abap_random=>create( seed = cl_abap_random=>seed( ) ).
DATA ranges_tab TYPE if_abap_prob_types=>int_range.
ranges_tab = VALUE #( ( sign = 'I' option = 'BT' low = 1 high = 100 ) ).
DATA(distribution) = cl_abap_prob_distribution=>get_uniform_int_distribution( range = ranges_tab ).
DATA(int_tab) = distribution->next_random_numbers( count = 20 rng = random ).

"An initial ranges tables means that all numbers are respected.
distribution = cl_abap_prob_distribution=>get_uniform_int_distribution( range = VALUE #( ) ).
int_tab = distribution->next_random_numbers( count = 20 rng = random ).

"The following example gets random, distinct integer values from a specified range and stores
"them in an internal table (integer table of type i). The example selects 10 distinct random 
"numbers from the range of 1 to 100.
TYPES ty_range TYPE if_abap_prob_types=>int_range.
DATA(demo_range) = VALUE ty_range( ( sign = 'I' option = 'BT' low = 1 high = 100 ) ).

DATA(nums) = REDUCE if_abap_prob_distribution_int=>random_numbers(
  LET let_rng = cl_abap_random=>create( cl_abap_random=>seed( ) ) IN
  INIT numbers = VALUE if_abap_prob_distribution_int=>random_numbers( )
        rng = demo_range
        number = 0
        dist = cl_abap_prob_distribution=>get_uniform_int_distribution( range = demo_range )
  FOR i = 1  UNTIL i > 10
  NEXT number = dist->next_random_number( let_rng )
        numbers = VALUE #( BASE numbers ( number ) )
        rng = VALUE #( BASE rng ( sign = 'E' option = 'EQ' low = number ) )
        dist =  cl_abap_prob_distribution=>get_uniform_int_distribution( range = rng ) ).
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
